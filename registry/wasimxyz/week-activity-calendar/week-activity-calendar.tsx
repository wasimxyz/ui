import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { WeekActivityHeatmap } from "./week-activity-calendar-heatmap";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-cell / week-wide counts keyed by arbitrary activity kind. */
export type ActivityCounts = Record<string, number>;

/** Singular/plural noun (and optional summary verb) for a kind. */
export interface ActivityKindMeta {
  one: string;
  other: string;
  /** Appended in the summary line, e.g. "pushed" → "2 commits pushed". */
  verb?: string;
}

/**
 * One data source’s contribution to the week grid. Pass several into
 * `WeekActivityCalendar` to render them as a single heatmap. When two entries
 * share an `id`, the later one replaces the earlier (counts are not doubled).
 */
export interface WeekActivitySeries {
  /** 7 rows (0 = Sunday … 6 = Saturday) × 24 hours (0–23 local). */
  grid: ActivityCounts[][];
  /** Stable identity for this series; used to dedupe when merging. */
  id: string;
  kindMeta: Record<string, ActivityKindMeta>;
  /** Kind keys this series contributes, in display order. */
  kinds: readonly string[];
  totals: ActivityCounts;
}

/** The day a week starts on → its JS `getDay` index. */
export type WeekStart =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export const WEEK_START_INDEX: Record<WeekStart, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export type ColorScale = readonly string[];

/** Default grayscale scale — opacity steps of `--foreground`. */
export const DEFAULT_COLOR_SCALE: ColorScale = [
  "bg-foreground/[0.06]",
  "bg-foreground/20",
  "bg-foreground/40",
  "bg-foreground/60",
  "bg-foreground/85",
];

/** Ready-made scale using the shadcn `--primary` token. */
export const PRIMARY_COLOR_SCALE: ColorScale = [
  "bg-primary/[0.08]",
  "bg-primary/25",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
];

export interface WeekActivityCalendarProps {
  ariaLabel?: string;
  colorScale?: ColorScale;
  emptyLabel?: string;
  /**
   * Optional filter of kind keys to include. Intensity and the summary
   * re-normalize to the selection. An empty array renders an empty grid.
   * Defaults to every kind across `series` when omitted.
   */
  kinds?: readonly string[];
  /** One or more activity series merged into a single week heatmap. */
  series: readonly WeekActivitySeries[];
  summaryEmptyLabel?: string;
  /**
   * First day of the week for display. Pass the same value you gave to
   * `resolveWeekBounds` (or use the `weekStartsOn` it returns) so fetch bounds
   * and row order stay aligned.
   */
  weekStartsOn?: WeekStart;
}

export interface WeekActivityCalendarSkeletonProps {
  weekStartsOn?: WeekStart;
}

// ---------------------------------------------------------------------------
// Week-bound helpers (shared by data loaders)
// ---------------------------------------------------------------------------

/** A calendar day, decoupled from any instant/timezone. */
export interface CalendarDay {
  day: number;
  month: number;
  year: number;
}

/** Empty 7×24 grid of activity counts. */
export function createActivityGrid(
  createCell: () => ActivityCounts = () => ({})
): ActivityCounts[][] {
  return Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, createCell)
  );
}

/** Build the formatter that buckets timestamps into the configured timezone. */
export function createPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
}

/** Resolve an instant to its calendar day in the formatter's timezone. */
export function localCalendarDay(
  formatter: Intl.DateTimeFormat,
  date: Date
): CalendarDay {
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

/** Zero-padded YYYY-MM-DD for lexical date comparison. */
export function toYmd({ year, month, day }: CalendarDay): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Bounds of the week containing `reference`, as local YYYY-MM-DD strings.
 * `today` is capped at `nowYmd` so upcoming days of the current week aren't
 * queried, while past weeks include all seven.
 */
export function weekRange(
  reference: CalendarDay,
  nowYmd: string,
  weekStartsOn: number
): { weekStart: string; today: string } {
  const start = new Date(
    Date.UTC(reference.year, reference.month - 1, reference.day)
  );
  const offset = (start.getUTCDay() - weekStartsOn + 7) % 7;
  start.setUTCDate(start.getUTCDate() - offset);
  const weekStart = start.toISOString().slice(0, 10);

  const last = new Date(start);
  last.setUTCDate(last.getUTCDate() + 6);
  const weekEnd = last.toISOString().slice(0, 10);

  const today = weekEnd < nowYmd ? weekEnd : nowYmd;
  return { weekStart, today };
}

const YMD_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Resolve a `week` prop to the calendar day whose week should be shown.
 * A YYYY-MM-DD string is read as a calendar day; a `Date` as an instant in
 * the formatter's timezone; missing/invalid falls back to today.
 */
export function resolveReferenceDay(
  week: Date | string | undefined,
  formatter: Intl.DateTimeFormat,
  now: Date
): CalendarDay {
  if (typeof week === "string") {
    const match = YMD_PREFIX.exec(week);
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
      };
    }
  }
  const date = week === undefined ? now : new Date(week);
  const instant = Number.isNaN(date.getTime()) ? now : date;
  return localCalendarDay(formatter, instant);
}

/**
 * Request-time week bounds for a given timezone / week selection. Call outside
 * any `"use cache"` scope so the clock isn't frozen to build time.
 *
 * Returns `weekStartsOn` so callers can pass the same value into
 * `WeekActivityCalendar` and keep fetch bounds aligned with display order.
 */
export function resolveWeekBounds({
  timeZone,
  week,
  weekStartsOn = "sunday",
  now = new Date(),
}: {
  timeZone: string;
  week?: Date | string;
  weekStartsOn?: WeekStart;
  now?: Date;
}): {
  weekStart: string;
  today: string;
  startIndex: number;
  weekStartsOn: WeekStart;
} {
  const formatter = createPartsFormatter(timeZone);
  const nowYmd = toYmd(localCalendarDay(formatter, now));
  const reference = resolveReferenceDay(week, formatter, now);
  const startIndex = WEEK_START_INDEX[weekStartsOn];
  const { weekStart, today } = weekRange(reference, nowYmd, startIndex);
  return { weekStart, today, startIndex, weekStartsOn };
}

// ---------------------------------------------------------------------------
// Layout (skeleton; heatmap keeps its own copy to stay a Client Component)
// ---------------------------------------------------------------------------

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const GRID_COLS = "grid-cols-[1rem_repeat(24,minmax(0,1fr))]";
const GRID_WIDTH = "min-w-[320px]";
const CELL_CLASS = "aspect-square rounded-sm";
const ROW_STACK = "flex flex-col gap-1.5";

function displayRows(weekStartsOn: number): number[] {
  return Array.from(
    { length: 7 },
    (_, position) => (weekStartsOn + position) % 7
  );
}

// ---------------------------------------------------------------------------
// Merge + presentation helpers
// ---------------------------------------------------------------------------

function cellTotal(cell: ActivityCounts, kinds: readonly string[]): number {
  return kinds.reduce((sum, kind) => sum + (cell[kind] ?? 0), 0);
}

function addCounts(target: ActivityCounts, source: ActivityCounts): void {
  for (const [kind, count] of Object.entries(source)) {
    if (count > 0) {
      target[kind] = (target[kind] ?? 0) + count;
    }
  }
}

function registerKinds(
  entry: WeekActivitySeries,
  kinds: string[],
  seenKinds: Set<string>,
  kindMeta: Record<string, ActivityKindMeta>
): void {
  for (const kind of entry.kinds) {
    if (!seenKinds.has(kind)) {
      seenKinds.add(kind);
      kinds.push(kind);
    }
    const meta = entry.kindMeta[kind];
    if (meta) {
      kindMeta[kind] = meta;
    }
  }
}

function addGrid(target: ActivityCounts[][], source: ActivityCounts[][]): void {
  for (let row = 0; row < 7; row++) {
    for (let hour = 0; hour < 24; hour++) {
      addCounts(target[row][hour], source[row]?.[hour] ?? {});
    }
  }
}

/** Last series with a given `id` wins; order follows first appearance of each id. */
function dedupeSeries(
  series: readonly WeekActivitySeries[]
): WeekActivitySeries[] {
  const lastById = new Map<string, WeekActivitySeries>();
  for (const entry of series) {
    lastById.set(entry.id, entry);
  }
  const ordered: WeekActivitySeries[] = [];
  const seen = new Set<string>();
  for (const entry of series) {
    if (seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    const latest = lastById.get(entry.id);
    if (latest) {
      ordered.push(latest);
    }
  }
  return ordered;
}

function mergeSeries(series: readonly WeekActivitySeries[]): {
  grid: ActivityCounts[][];
  totals: ActivityCounts;
  kinds: string[];
  kindMeta: Record<string, ActivityKindMeta>;
} {
  const kinds: string[] = [];
  const seenKinds = new Set<string>();
  const kindMeta: Record<string, ActivityKindMeta> = {};
  const grid = createActivityGrid();
  const totals: ActivityCounts = {};

  for (const entry of dedupeSeries(series)) {
    registerKinds(entry, kinds, seenKinds, kindMeta);
    addGrid(grid, entry.grid);
    addCounts(totals, entry.totals);
  }

  return { grid, totals, kinds, kindMeta };
}

function countNoun(meta: ActivityKindMeta, count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? meta.one : meta.other}`;
}

function summaryPhrase(meta: ActivityKindMeta, count: number): string {
  const phrase = countNoun(meta, count);
  return meta.verb ? `${phrase} ${meta.verb}` : phrase;
}

// ---------------------------------------------------------------------------
// Public components
// ---------------------------------------------------------------------------

export function WeekActivityCalendar({
  series,
  kinds: kindsFilter,
  colorScale = DEFAULT_COLOR_SCALE,
  weekStartsOn = "sunday",
  emptyLabel = "No activity",
  summaryEmptyLabel = "No activity this week",
  ariaLabel = "Activity by day of week and hour of day",
}: WeekActivityCalendarProps) {
  const scale = colorScale.length > 0 ? colorScale : DEFAULT_COLOR_SCALE;
  const startIndex = WEEK_START_INDEX[weekStartsOn];

  const merged = mergeSeries(series);
  const kinds =
    kindsFilter === undefined
      ? merged.kinds
      : merged.kinds.filter((kind) => kindsFilter.includes(kind));

  let max = 0;
  for (const row of merged.grid) {
    for (const cell of row) {
      const total = cellTotal(cell, kinds);
      if (total > max) {
        max = total;
      }
    }
  }

  const summary =
    kinds
      .filter((kind) => (merged.totals[kind] ?? 0) > 0)
      .map((kind) => {
        const meta = merged.kindMeta[kind] ?? { one: kind, other: kind };
        return summaryPhrase(meta, merged.totals[kind] ?? 0);
      })
      .join(", ") || summaryEmptyLabel;

  return (
    <div className="flex flex-col gap-3 overflow-x-auto">
      <WeekActivityHeatmap
        ariaLabel={`${ariaLabel}. ${summary}`}
        colorScale={scale}
        emptyLabel={emptyLabel}
        grid={merged.grid}
        kindMeta={merged.kindMeta}
        kinds={kinds}
        max={max}
        startIndex={startIndex}
      />
      <span className="text-muted-foreground text-sm">{summary}</span>
    </div>
  );
}

/** Layout-matched loading state for `WeekActivityCalendar`. */
export function WeekActivityCalendarSkeleton({
  weekStartsOn = "sunday",
}: WeekActivityCalendarSkeletonProps = {}) {
  const startIndex = WEEK_START_INDEX[weekStartsOn];

  return (
    <div className="flex flex-col gap-3 overflow-x-auto">
      <div className={cn(ROW_STACK, GRID_WIDTH)}>
        {displayRows(startIndex).map((dataRow) => (
          <div
            className={cn("grid items-center gap-1 md:gap-2", GRID_COLS)}
            key={dataRow}
          >
            <span className="text-muted-foreground text-xs">
              {WEEKDAY_LABELS[dataRow]}
            </span>
            {HOURS.map((hour) => (
              <Skeleton className={CELL_CLASS} key={hour} />
            ))}
          </div>
        ))}
        <div
          className={cn(
            "grid gap-1 pt-1 text-muted-foreground text-xs md:gap-2",
            GRID_COLS
          )}
        >
          <span />
          {[0, 6, 12, 18].map((position) => (
            <span className="col-span-6" key={position} />
          ))}
        </div>
      </div>
      <Skeleton className="h-5 w-72" />
    </div>
  );
}
