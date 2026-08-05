import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
 * `WeekActivityCalendar` to render them as a single heatmap.
 */
export interface WeekActivitySeries {
  /** 7 rows (0 = Sunday … 6 = Saturday) × 24 hours (0–23 local). */
  grid: ActivityCounts[][];
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

// ---------------------------------------------------------------------------
// Week-bound helpers (shared by data loaders)
// ---------------------------------------------------------------------------

/** A calendar day, decoupled from any instant/timezone. */
export interface CalendarDay {
  day: number;
  month: number;
  year: number;
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
}): { weekStart: string; today: string; startIndex: number } {
  const formatter = createPartsFormatter(timeZone);
  const nowYmd = toYmd(localCalendarDay(formatter, now));
  const reference = resolveReferenceDay(week, formatter, now);
  const startIndex = WEEK_START_INDEX[weekStartsOn];
  const { weekStart, today } = weekRange(reference, nowYmd, startIndex);
  return { weekStart, today, startIndex };
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function displayRows(weekStartsOn: number): number[] {
  return Array.from(
    { length: 7 },
    (_, position) => (weekStartsOn + position) % 7
  );
}

const START_HOUR = 0;
const HOUR_ORDER = Array.from(
  { length: 24 },
  (_, index) => (index + START_HOUR) % 24
);

const GRID_COLS = "grid-cols-[1rem_repeat(24,minmax(0,1fr))]";
const GRID_WIDTH = "min-w-[320px]";
const CELL_CLASS = "aspect-square rounded-sm";
const ROW_STACK = "flex flex-col gap-1.5";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const LABEL_POSITIONS = [0, 6, 12, 18];

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

function mergeSeries(series: readonly WeekActivitySeries[]): {
  grid: ActivityCounts[][];
  totals: ActivityCounts;
  kinds: string[];
  kindMeta: Record<string, ActivityKindMeta>;
} {
  const kinds: string[] = [];
  const seenKinds = new Set<string>();
  const kindMeta: Record<string, ActivityKindMeta> = {};
  const grid: ActivityCounts[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({}))
  );
  const totals: ActivityCounts = {};

  for (const entry of series) {
    registerKinds(entry, kinds, seenKinds, kindMeta);
    addGrid(grid, entry.grid);
    addCounts(totals, entry.totals);
  }

  return { grid, totals, kinds, kindMeta };
}

function levelFor(count: number, max: number, steps: number): number {
  if (count <= 0 || max <= 0 || steps <= 0) {
    return 0;
  }
  const level = Math.ceil((count / max) * steps);
  return Math.min(level, steps);
}

function hourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour} ${period}`;
}

function shortHour(hour: number): string {
  const period = hour < 12 ? "a" : "p";
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}${period}`;
}

function countNoun(meta: ActivityKindMeta, count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? meta.one : meta.other}`;
}

function summaryPhrase(meta: ActivityKindMeta, count: number): string {
  const phrase = countNoun(meta, count);
  return meta.verb ? `${phrase} ${meta.verb}` : phrase;
}

function HeatmapCell({
  cell,
  colorScale,
  dayName,
  emptyLabel,
  hour,
  kindMeta,
  kinds,
  max,
}: {
  cell: ActivityCounts;
  colorScale: ColorScale;
  dayName: string;
  emptyLabel: string;
  hour: number;
  kindMeta: Record<string, ActivityKindMeta>;
  kinds: readonly string[];
  max: number;
}) {
  const total = cellTotal(cell, kinds);
  const lines = kinds
    .filter((kind) => (cell[kind] ?? 0) > 0)
    .map((kind) => {
      const meta = kindMeta[kind] ?? { one: kind, other: kind };
      return countNoun(meta, cell[kind] ?? 0);
    });

  const level = levelFor(total, max, colorScale.length - 1);

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`${dayName} ${hourLabel(hour)}`}
        className={cn(CELL_CLASS, colorScale[level])}
        type="button"
      />
      <TooltipContent className="flex flex-col gap-0.5">
        <span className="font-medium">
          {dayName} {hourLabel(hour)}
        </span>
        {lines.length > 0 ? (
          lines.map((line) => <span key={line}>{line}</span>)
        ) : (
          <span>{emptyLabel}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function HourAxis() {
  return (
    <div
      className={cn(
        "grid gap-1 pt-1 text-muted-foreground text-xs md:gap-2",
        GRID_COLS
      )}
    >
      <span />
      {LABEL_POSITIONS.map((position, index) => {
        const isLast = index === LABEL_POSITIONS.length - 1;
        return (
          <span
            className={cn("col-span-6", isLast && "flex justify-between")}
            key={position}
          >
            <span>{shortHour(HOUR_ORDER[position])}</span>
            {isLast ? <span>{shortHour(HOUR_ORDER[23])}</span> : null}
          </span>
        );
      })}
    </div>
  );
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
}: {
  /** One or more activity series merged into a single week heatmap. */
  series: readonly WeekActivitySeries[];
  /**
   * Optional filter of kind keys to include. Intensity and the summary
   * re-normalize to the selection. Defaults to every kind across `series`.
   */
  kinds?: readonly string[];
  colorScale?: ColorScale;
  weekStartsOn?: WeekStart;
  emptyLabel?: string;
  summaryEmptyLabel?: string;
  ariaLabel?: string;
}) {
  const scale = colorScale.length > 0 ? colorScale : DEFAULT_COLOR_SCALE;
  const startIndex =
    typeof weekStartsOn === "string"
      ? WEEK_START_INDEX[weekStartsOn]
      : weekStartsOn;

  const merged = mergeSeries(series);
  const selected = kindsFilter ? new Set(kindsFilter) : null;
  const activeKinds =
    selected && selected.size > 0
      ? merged.kinds.filter((kind) => selected.has(kind))
      : merged.kinds;
  const kinds = activeKinds.length > 0 ? activeKinds : merged.kinds;

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
    <TooltipProvider>
      <div className="flex flex-col gap-3 overflow-x-auto">
        <div
          aria-label={ariaLabel}
          className={cn(ROW_STACK, GRID_WIDTH)}
          role="img"
        >
          {displayRows(startIndex).map((dataRow) => (
            <div
              className={cn("grid items-center gap-1 md:gap-2", GRID_COLS)}
              key={dataRow}
            >
              <span className="text-muted-foreground text-xs">
                {WEEKDAY_LABELS[dataRow]}
              </span>
              {HOUR_ORDER.map((hour) => (
                <HeatmapCell
                  cell={merged.grid[dataRow][hour]}
                  colorScale={scale}
                  dayName={DAY_NAMES[dataRow]}
                  emptyLabel={emptyLabel}
                  hour={hour}
                  key={hour}
                  kindMeta={merged.kindMeta}
                  kinds={kinds}
                  max={max}
                />
              ))}
            </div>
          ))}
          <HourAxis />
        </div>
        <span className="text-muted-foreground text-sm">{summary}</span>
      </div>
    </TooltipProvider>
  );
}

/** Layout-matched loading state for `WeekActivityCalendar`. */
export function WeekActivityCalendarSkeleton({
  weekStartsOn = "sunday",
}: {
  weekStartsOn?: WeekStart | number;
} = {}) {
  const startIndex =
    typeof weekStartsOn === "string"
      ? WEEK_START_INDEX[weekStartsOn]
      : weekStartsOn;

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
            {HOUR_ORDER.map((hour) => (
              <Skeleton className={CELL_CLASS} key={hour} />
            ))}
          </div>
        ))}
        <HourAxis />
      </div>
      <Skeleton className="h-5 w-72" />
    </div>
  );
}
