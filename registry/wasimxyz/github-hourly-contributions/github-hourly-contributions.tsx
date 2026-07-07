"server-only";

import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Data layer
//
// This whole module is a Server Component file (no "use client"), so it can
// safely keep the token-authenticated GitHub fetching alongside the rendering:
// the grid below only composes the client `Tooltip` primitives, which a Server
// Component is allowed to render directly.
// ---------------------------------------------------------------------------

const GITHUB_API = "https://api.github.com";
const PER_PAGE = 100;
// The events feed exposes at most ~300 recent events (3 pages of 100), which
// comfortably covers a single week.
const MAX_EVENT_PAGES = 3;
// The issues Search API caps at 1000 results; a week is far fewer, so this is
// just a safety bound on pagination.
const MAX_SEARCH_PAGES = 10;
// Per-branch commit pages to walk (300 of the user's commits on one branch in a
// single week is already implausible).
const MAX_COMMIT_PAGES = 3;

// Per-cell breakdown of contributions by type.
export interface CellBreakdown {
  commits: number;
  issues: number;
  issuesClosed: number;
  pullRequests: number;
  repositories: number;
  reviews: number;
}

export type ContributionKind = keyof CellBreakdown;

// Every contribution kind, in the canonical order used for rendering (tooltip
// lines, the summary) and for the default of the `types` filter.
export const CONTRIBUTION_KINDS: readonly ContributionKind[] = [
  "commits",
  "pullRequests",
  "issues",
  "issuesClosed",
  "reviews",
  "repositories",
];

export interface ContributionHeatmap {
  // 7 rows (0 = Sunday … 6 = Saturday, i.e. JS getDay order) × 24 columns
  // (0–23 local hour). The starting day is applied at render time.
  grid: CellBreakdown[][];
  // Highest per-cell total, used to scale the heatmap intensity.
  max: number;
  // Week-wide totals by type.
  totals: CellBreakdown;
}

// Map the short weekday name to its JS getDay index (0 = Sunday … 6 = Saturday),
// which is the canonical grid row. The configured start day only rotates the
// rows at render time, so the stored grid stays start-day agnostic.
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// The day a week starts on, as a `weekStartsOn` prop value → its getDay index.
export type WeekStart =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

const WEEK_START_INDEX: Record<WeekStart, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

// Build the formatter that buckets timestamps into the configured timezone.
function createPartsFormatter(timeZone: string): Intl.DateTimeFormat {
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

function emptyCell(): CellBreakdown {
  return {
    commits: 0,
    pullRequests: 0,
    issues: 0,
    issuesClosed: 0,
    reviews: 0,
    repositories: 0,
  };
}

function createEmptyGrid(): CellBreakdown[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, emptyCell));
}

function cellTotal(cell: CellBreakdown, kinds = CONTRIBUTION_KINDS): number {
  return kinds.reduce((sum, kind) => sum + cell[kind], 0);
}

// A calendar day, decoupled from any instant/timezone.
interface CalendarDay {
  day: number;
  month: number;
  year: number;
}

// Resolve an instant to its calendar day in the formatter's timezone.
function localCalendarDay(
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

// Zero-padded YYYY-MM-DD, matching the format of ISO date slices so the two
// can be compared lexically.
function toYmd({ year, month, day }: CalendarDay): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

// The bounds of the week containing `reference`, as local YYYY-MM-DD strings,
// where the week begins on `weekStartsOn` (0 = Sunday … 6 = Saturday). `today`
// is the last day to include: the week's final day, or the real current day
// (`nowYmd`) when that is still in the future — so upcoming days of the current
// week aren't queried, while past weeks include all seven.
function weekRange(
  reference: CalendarDay,
  nowYmd: string,
  weekStartsOn: number
): { weekStart: string; today: string } {
  // Whole-day arithmetic in UTC to find the week's first day.
  const start = new Date(
    Date.UTC(reference.year, reference.month - 1, reference.day)
  );
  // Days elapsed since the configured start-of-week.
  const offset = (start.getUTCDay() - weekStartsOn + 7) % 7;
  start.setUTCDate(start.getUTCDate() - offset);
  const weekStart = start.toISOString().slice(0, 10);

  const last = new Date(start);
  last.setUTCDate(last.getUTCDate() + 6);
  const weekEnd = last.toISOString().slice(0, 10);

  const today = weekEnd < nowYmd ? weekEnd : nowYmd;
  return { weekStart, today };
}

// A leading YYYY-MM-DD in the `week` prop, read as a calendar day.
const YMD_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

// Resolve the `week` prop to the calendar day whose week should be shown. A
// plain YYYY-MM-DD string is read as a calendar day directly (so it isn't
// shifted across midnight by the timezone); a `Date` is resolved as an instant
// in `timeZone`; anything missing or invalid falls back to today.
function resolveReferenceDay(
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

// Resolve an event timestamp to its (weekday, hour) bucket in the configured
// tz — or null if it is malformed or outside the current local week.
function cellBucket(
  formatter: Intl.DateTimeFormat,
  isoDate: string,
  weekStart: string,
  today: string
): { row: number; hour: number } | null {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  const weekday = get("weekday");
  const hourValue = get("hour");
  const year = get("year");
  const month = get("month");
  const day = get("day");
  if (!(weekday && hourValue && year && month && day)) {
    return null;
  }

  // Keep only contributions from the current local week.
  const localDate = `${year}-${month}-${day}`;
  if (localDate < weekStart || localDate > today) {
    return null;
  }

  const row = WEEKDAY_INDEX[weekday];
  // "h23" yields 00–23, but normalize 24 → 0 defensively.
  const hour = Number.parseInt(hourValue, 10) % 24;
  if (row === undefined || Number.isNaN(hour)) {
    return null;
  }

  return { row, hour };
}

async function githubFetch<T>(url: string, token: string): Promise<T> {
  // Caching is handled by the surrounding `use cache` scope in
  // `getContributionHeatmap`, which captures the fetched result.
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${url}`);
  }

  return response.json() as Promise<T>;
}

interface GitHubEvent {
  created_at: string;
  payload: {
    // "closed"/"opened"/… on IssuesEvent; "created" on PullRequestReviewEvent.
    action?: string;
    head?: string;
    ref?: string;
    // "repository"/"branch"/"tag" on CreateEvent.
    ref_type?: string;
  };
  repo: { name: string };
  type: string;
}

// Page through the events feed (newest-first), collecting events from the
// current week. Stops as soon as it reaches an older week.
async function fetchWeekEvents(
  token: string,
  username: string,
  weekStart: string
): Promise<GitHubEvent[]> {
  const collected: GitHubEvent[] = [];

  for (let page = 1; page <= MAX_EVENT_PAGES; page++) {
    const url = `${GITHUB_API}/users/${username}/events?per_page=${PER_PAGE}&page=${page}`;
    const events = await githubFetch<GitHubEvent[]>(url, token);
    if (!(Array.isArray(events) && events.length > 0)) {
      break;
    }

    const inWeek = events.filter(
      (event) => event.created_at.slice(0, 10) >= weekStart
    );
    collected.push(...inWeek);

    // Once a page contains older events, everything after is older too.
    if (inWeek.length < events.length || events.length < PER_PAGE) {
      break;
    }
  }

  return collected;
}

interface PushTarget {
  head: string;
  repo: string;
}

// The current PushEvent payload carries no commit count, so to count commits
// accurately we re-read the refs. Collect the latest pushed head per
// (repo, branch) this week — its history reaches every commit pushed there.
function latestPushTargets(events: GitHubEvent[]): PushTarget[] {
  const byBranch = new Map<string, PushTarget>();
  for (const event of events) {
    const head = event.payload.head;
    if (event.type !== "PushEvent" || !head) {
      continue;
    }
    // Events are newest-first, so the first head seen per branch is the latest.
    const key = `${event.repo.name}\n${event.payload.ref ?? ""}`;
    if (!byBranch.has(key)) {
      byBranch.set(key, { repo: event.repo.name, head });
    }
  }
  return [...byBranch.values()];
}

interface RepoCommit {
  commit: { author: { date: string } };
  sha: string;
}

// List the user's commits reachable from `head`, authored since `sinceIso`.
// Reads the ref directly (no Search-index lag) and includes private repos via
// the token. Resilient: returns [] if the repo/ref is gone or a request fails,
// so one bad branch can't blank the whole heatmap.
async function fetchCommits(
  token: string,
  username: string,
  target: PushTarget,
  sinceIso: string
): Promise<RepoCommit[]> {
  const commits: RepoCommit[] = [];
  const author = encodeURIComponent(username);

  try {
    for (let page = 1; page <= MAX_COMMIT_PAGES; page++) {
      const url = `${GITHUB_API}/repos/${target.repo}/commits?sha=${target.head}&author=${author}&since=${sinceIso}&per_page=${PER_PAGE}&page=${page}`;
      const batch = await githubFetch<RepoCommit[]>(url, token);
      if (!(Array.isArray(batch) && batch.length > 0)) {
        break;
      }
      commits.push(...batch);
      if (batch.length < PER_PAGE) {
        break;
      }
    }
  } catch (error) {
    console.error(`Failed to load commits for ${target.repo}:`, error);
  }

  return commits;
}

interface IssueSearchItem {
  created_at: string;
  // Present only on pull requests; absent on issues.
  pull_request?: unknown;
}

// PRs and issues the user opened this week, via the issues Search API (which is
// real-time for them and, with the token, includes private items).
async function fetchWeekIssues(
  token: string,
  username: string,
  weekStart: string
): Promise<IssueSearchItem[]> {
  const collected: IssueSearchItem[] = [];
  const query = `author:${username} created:>=${weekStart}`;

  for (let page = 1; page <= MAX_SEARCH_PAGES; page++) {
    const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=${page}`;
    const data = await githubFetch<{ items: IssueSearchItem[] }>(url, token);
    const items = data.items ?? [];
    collected.push(...items);
    if (items.length < PER_PAGE) {
      break;
    }
  }

  return collected;
}

// Record `amount` contributions of `kind` into the grid + totals, bucketed by
// local time — skipping anything malformed or outside the current week.
function record(
  formatter: Intl.DateTimeFormat,
  grid: CellBreakdown[][],
  totals: CellBreakdown,
  isoDate: string,
  kind: ContributionKind,
  amount: number,
  weekStart: string,
  today: string
): void {
  if (amount <= 0) {
    return;
  }
  const bucket = cellBucket(formatter, isoDate, weekStart, today);
  if (!bucket) {
    return;
  }
  grid[bucket.row][bucket.hour][kind] += amount;
  totals[kind] += amount;
}

// Count the user's commits this week accurately: fetch each pushed branch's
// commits in parallel, dedupe by SHA (a commit can appear on several branches
// or be re-pushed), and bucket each by its author date.
async function recordCommits(
  formatter: Intl.DateTimeFormat,
  grid: CellBreakdown[][],
  totals: CellBreakdown,
  token: string,
  username: string,
  events: GitHubEvent[],
  weekStart: string,
  today: string
): Promise<void> {
  const sinceIso = `${weekStart}T00:00:00Z`;
  const targets = latestPushTargets(events);
  const lists = await Promise.all(
    targets.map((target) => fetchCommits(token, username, target, sinceIso))
  );

  const seen = new Set<string>();
  for (const list of lists) {
    for (const item of list) {
      if (seen.has(item.sha)) {
        continue;
      }
      seen.add(item.sha);
      record(
        formatter,
        grid,
        totals,
        item.commit.author.date,
        "commits",
        1,
        weekStart,
        today
      );
    }
  }
}

// Reviews submitted, repositories created, and issues closed all surface
// directly on the events feed, so they're counted from the events already
// fetched — no extra requests — each bucketed by its event timestamp.
function recordEventContributions(
  formatter: Intl.DateTimeFormat,
  grid: CellBreakdown[][],
  totals: CellBreakdown,
  events: GitHubEvent[],
  weekStart: string,
  today: string
): void {
  for (const event of events) {
    let kind: ContributionKind | null = null;
    if (event.type === "PullRequestReviewEvent") {
      kind = "reviews";
    } else if (
      event.type === "CreateEvent" &&
      event.payload.ref_type === "repository"
    ) {
      kind = "repositories";
    } else if (
      event.type === "IssuesEvent" &&
      event.payload.action === "closed"
    ) {
      kind = "issuesClosed";
    }

    if (kind) {
      record(
        formatter,
        grid,
        totals,
        event.created_at,
        kind,
        1,
        weekStart,
        today
      );
    }
  }
}

/**
 * Builds a day-of-week × hour-of-day heatmap of the user's GitHub
 * contributions — commits pushed (to any branch), pull requests and issues
 * opened, issues closed, pull request reviews submitted, and repositories
 * created — for the week bounded by `weekStart`…`today` (the caller's chosen
 * start day → the end of that week, capped at the current day) in the given
 * `timeZone`. Rows are stored in canonical Sunday-first order. Each cell
 * carries a per-type breakdown. Only aggregate timing counts are produced; repo
 * names and content are never surfaced.
 *
 * `weekStart` and `today` are passed in (not read from `new Date()` here) on
 * purpose: this function is cached with `use cache`, and a clock read inside
 * that scope would be frozen to build time. Taking the bounds as arguments
 * makes them part of the cache key, so the entry refreshes as the day/week
 * advances. The caller (`GithubHourlyContributions`) computes them at request
 * time.
 *
 * Three real-time, token-authenticated (private-inclusive) sources are used,
 * because no single one is both complete and current for the week:
 *  - the events feed (`/users/:user/events`) discovers which branches were
 *    pushed (its 30-day timeline reliably carries pushes)
 *  - the commits API re-reads those branches for an exact, deduped commit count
 *    by author date — the commit Search API lags indexing by days, and the
 *    PushEvent payload no longer carries a commit count
 *  - the issues Search API yields PRs and issues opened — the events feed
 *    doesn't surface PR opens reliably
 *  - the same events feed also carries reviews submitted
 *    (`PullRequestReviewEvent`), repositories created (`CreateEvent`), and
 *    issues closed (`IssuesEvent`), counted straight from the events above
 *
 * Requires `GITHUB_TOKEN` (classic PAT, `repo` + `read:user`) and
 * `GITHUB_USERNAME`. Returns an empty grid if either is missing or a request
 * fails, so the page degrades gracefully.
 */
export async function getContributionHeatmap({
  timeZone,
  weekStart,
  today,
}: {
  timeZone: string;
  weekStart: string;
  today: string;
}): Promise<ContributionHeatmap> {
  "use cache";
  cacheLife({ revalidate: 1800 });
  cacheTag("github-contributions");

  const token = process.env.GITHUB_TOKEN;
  const username = process.env.GITHUB_USERNAME;
  if (!(token && username)) {
    return { grid: createEmptyGrid(), max: 0, totals: emptyCell() };
  }

  const formatter = createPartsFormatter(timeZone);
  const grid = createEmptyGrid();
  const totals = emptyCell();

  try {
    const [events, issues] = await Promise.all([
      fetchWeekEvents(token, username, weekStart),
      fetchWeekIssues(token, username, weekStart),
    ]);

    await recordCommits(
      formatter,
      grid,
      totals,
      token,
      username,
      events,
      weekStart,
      today
    );

    recordEventContributions(formatter, grid, totals, events, weekStart, today);

    for (const item of issues) {
      const kind: ContributionKind = item.pull_request
        ? "pullRequests"
        : "issues";
      record(
        formatter,
        grid,
        totals,
        item.created_at,
        kind,
        1,
        weekStart,
        today
      );
    }
  } catch (error) {
    console.error("Failed to load GitHub contributions:", error);
    return { grid: createEmptyGrid(), max: 0, totals: emptyCell() };
  }

  let max = 0;
  for (const row of grid) {
    for (const cell of row) {
      const total = cellTotal(cell);
      if (total > max) {
        max = total;
      }
    }
  }

  return { grid, max, totals };
}

// ---------------------------------------------------------------------------
// Layout constants
//
// Shared by the interactive heatmap grid and its loading skeleton.
// ---------------------------------------------------------------------------

// Single-letter labels, indexed by JS getDay (0 = Sunday … 6 = Saturday).
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// The seven grid rows in display order for a week starting on `weekStartsOn`:
// each entry is the canonical (Sunday-indexed) row to show at that position.
function displayRows(weekStartsOn: number): number[] {
  return Array.from(
    { length: 7 },
    (_, position) => (weekStartsOn + position) % 7
  );
}

// X-axis runs 12am → 11pm: hours 0,1,…,23 across the columns.
const START_HOUR = 0;
const HOUR_ORDER = Array.from(
  { length: 24 },
  (_, index) => (index + START_HOUR) % 24
);

// 25 columns: a fixed day-label column + 24 hour columns.
const GRID_COLS = "grid-cols-[1rem_repeat(24,minmax(0,1fr))]";

const GRID_WIDTH = "min-w-[320px]";

// Squares fill their column (full width); intensity is set per cell.
const CELL_CLASS = "aspect-square rounded-sm";

const ROW_STACK = "flex flex-col gap-1.5";

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

// Full day names, indexed by JS getDay (0 = Sunday … 6 = Saturday).
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Per-kind display strings: singular/plural nouns (for tooltip lines and the
// summary) and the verb the summary line appends, e.g. "2 commits pushed".
// `issuesClosed` folds "closed" into the noun, so it needs no verb.
const KIND_META: Record<
  ContributionKind,
  { one: string; other: string; verb: string }
> = {
  commits: { one: "commit", other: "commits", verb: "pushed" },
  pullRequests: { one: "pull request", other: "pull requests", verb: "opened" },
  issues: { one: "issue", other: "issues", verb: "opened" },
  issuesClosed: { one: "issue closed", other: "issues closed", verb: "" },
  reviews: { one: "review", other: "reviews", verb: "submitted" },
  repositories: { one: "repository", other: "repositories", verb: "created" },
};

// A color scale is an array of Tailwind background classes, lightest (index 0,
// used for empty cells) → darkest. Any shadcn color token works; supply a
// custom one via the `colorScale` prop. Built as opacity steps so a single
// semantic color reads correctly in both light and dark mode.
export type ColorScale = readonly string[];

// Default grayscale scale — opacity steps of --foreground.
export const DEFAULT_COLOR_SCALE: ColorScale = [
  "bg-foreground/[0.06]",
  "bg-foreground/20",
  "bg-foreground/40",
  "bg-foreground/60",
  "bg-foreground/85",
];

// Ready-made scale using the shadcn `--primary` token, for `colorScale={...}`.
export const PRIMARY_COLOR_SCALE: ColorScale = [
  "bg-primary/[0.08]",
  "bg-primary/25",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
];

// Column positions (every 6 hours) to label on the x-axis.
const LABEL_POSITIONS = [0, 6, 12, 18];

// Bucket `count` into 0 (empty) … `steps` (most intense). `steps` is the number
// of non-empty levels — i.e. `colorScale.length - 1`.
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

// Compact x-axis label, e.g. "6a", "12p".
function shortHour(hour: number): string {
  const period = hour < 12 ? "a" : "p";
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}${period}`;
}

// Count + noun, e.g. "2 commits", "1 issue closed", "1 repository".
function countNoun(kind: ContributionKind, count: number): string {
  const meta = KIND_META[kind];
  return `${count.toLocaleString()} ${count === 1 ? meta.one : meta.other}`;
}

// Summary phrase, e.g. "2 commits pushed" ("1 issue closed" carries no verb).
function summaryPhrase(kind: ContributionKind, count: number): string {
  const { verb } = KIND_META[kind];
  return verb ? `${countNoun(kind, count)} ${verb}` : countNoun(kind, count);
}

function HeatmapCell({
  cell,
  colorScale,
  dayName,
  hour,
  max,
  types,
}: {
  cell: CellBreakdown;
  colorScale: ColorScale;
  dayName: string;
  hour: number;
  max: number;
  types: readonly ContributionKind[];
}) {
  const total = cellTotal(cell, types);
  const lines = types
    .filter((kind) => cell[kind] > 0)
    .map((kind) => countNoun(kind, cell[kind]));

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
          <span>No contributions</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// The x-axis hour labels are fully static (they don't depend on the fetched
// data), so the grid and its loading skeleton share this row to stay
// pixel-aligned and avoid any layout shift when the data resolves.
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
            {/* The final block also labels the end of the axis (11pm). */}
            {isLast ? <span>{shortHour(HOUR_ORDER[23])}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

function GithubHourlyContributionsGrid({
  grid,
  totals,
  colorScale = DEFAULT_COLOR_SCALE,
  types = CONTRIBUTION_KINDS,
  weekStartsOn = 0,
}: ContributionHeatmap & {
  colorScale?: ColorScale;
  types?: readonly ContributionKind[];
  weekStartsOn?: number;
}) {
  // Guard against an empty scale so a cell always has a class to render.
  const scale = colorScale.length > 0 ? colorScale : DEFAULT_COLOR_SCALE;
  // Restrict to the selected kinds in canonical order (this also dedupes);
  // fall back to all kinds when the selection is empty.
  const selected = new Set(types);
  const activeTypes =
    selected.size > 0
      ? CONTRIBUTION_KINDS.filter((kind) => selected.has(kind))
      : CONTRIBUTION_KINDS;

  // Intensity scales to the busiest cell among the selected kinds only, so the
  // heatmap re-normalizes when the filter changes.
  let max = 0;
  for (const row of grid) {
    for (const cell of row) {
      const total = cellTotal(cell, activeTypes);
      if (total > max) {
        max = total;
      }
    }
  }

  // Summarize only the kinds with activity, so "0 X" phrases are omitted.
  const summary =
    activeTypes
      .filter((kind) => totals[kind] > 0)
      .map((kind) => summaryPhrase(kind, totals[kind]))
      .join(", ") || "No contributions this week";

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3 overflow-x-auto">
        <div
          aria-label="Heatmap of GitHub contributions by day of week and hour of day"
          className={cn(ROW_STACK, GRID_WIDTH)}
          role="img"
        >
          {displayRows(weekStartsOn).map((dataRow) => (
            <div
              className={cn("grid items-center gap-1 md:gap-2", GRID_COLS)}
              key={dataRow}
            >
              <span className="text-muted-foreground text-xs">
                {WEEKDAY_LABELS[dataRow]}
              </span>
              {HOUR_ORDER.map((hour) => (
                <HeatmapCell
                  cell={grid[dataRow][hour]}
                  colorScale={scale}
                  dayName={DAY_NAMES[dataRow]}
                  hour={hour}
                  key={hour}
                  max={max}
                  types={activeTypes}
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

// Loading state mirroring the grid's layout so the page doesn't shift when the
// data resolves. Takes `weekStartsOn` (0 = Sunday … 6 = Saturday) so its day
// labels can match a component configured with the same start day.
export function GithubHourlyContributionsSkeleton({
  weekStartsOn = 0,
}: {
  weekStartsOn?: number;
} = {}) {
  return (
    <div className="flex flex-col gap-3 overflow-x-auto">
      <div className={cn(ROW_STACK, GRID_WIDTH)}>
        {displayRows(weekStartsOn).map((dataRow) => (
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
        {/* Real x-axis labels — static, so render them as-is to match the
            loaded grid exactly. */}
        <HourAxis />
      </div>
      {/* Placeholder for the summary line, sized to the text-sm row it
          replaces, so the layout doesn't shift when the data resolves. */}
      <Skeleton className="h-5 w-72" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export async function GithubHourlyContributions({
  timeZone = "America/Los_Angeles",
  week,
  weekStartsOn = "sunday",
  colorScale = DEFAULT_COLOR_SCALE,
  types = CONTRIBUTION_KINDS,
}: {
  timeZone?: string;
  /**
   * The week to display, given as any day within it — a `Date` or a
   * `YYYY-MM-DD` string. Defaults to the current week.
   */
  week?: Date | string;
  /**
   * The day each row starts on — `"sunday"` … `"saturday"`. Sets both the
   * week's date range and the order of the rows. Defaults to `"sunday"`.
   */
  weekStartsOn?: WeekStart;
  /**
   * Heatmap color scale, lightest (empty) → darkest. Any shadcn color token
   * works; e.g. `PRIMARY_COLOR_SCALE`. Defaults to `DEFAULT_COLOR_SCALE`.
   */
  colorScale?: ColorScale;
  /**
   * Contribution types to include (multi-select filter) — any of `"commits"`,
   * `"pullRequests"`, `"issues"`, `"issuesClosed"`, `"reviews"`,
   * `"repositories"`. Intensity and the summary re-normalize to the selection.
   * Defaults to all (`CONTRIBUTION_KINDS`).
   */
  types?: readonly ContributionKind[];
} = {}) {
  // Halt prerendering here so everything below runs per request. Without this,
  // Next.js prerenders this component and freezes the `new Date()` read below
  // to build time — on Vercel the heatmap would then only refresh when ISR
  // regenerates the shell, drifting stale as `age` climbs.
  await connection();

  // Read "now" at request time, outside the cached `getContributionHeatmap`
  // scope, and pass the week bounds in so they key the cache. Computing them
  // inside `use cache` would freeze the week to build time.
  const now = new Date();
  const formatter = createPartsFormatter(timeZone);
  const nowYmd = toYmd(localCalendarDay(formatter, now));
  const reference = resolveReferenceDay(week, formatter, now);
  const startIndex = WEEK_START_INDEX[weekStartsOn];
  const { weekStart, today } = weekRange(reference, nowYmd, startIndex);
  const data = await getContributionHeatmap({ timeZone, weekStart, today });
  return (
    <GithubHourlyContributionsGrid
      {...data}
      colorScale={colorScale}
      types={types}
      weekStartsOn={startIndex}
    />
  );
}
