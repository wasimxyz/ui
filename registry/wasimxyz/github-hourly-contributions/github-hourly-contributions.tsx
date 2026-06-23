"server-only";

import { cacheLife, cacheTag } from "next/cache";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
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
  pullRequests: number;
}

export type ContributionKind = keyof CellBreakdown;

export interface ContributionHeatmap {
  // 7 rows (0 = Monday … 6 = Sunday) × 24 columns (0–23 local hour).
  grid: CellBreakdown[][];
  // Highest per-cell total, used to scale the heatmap intensity.
  max: number;
  // Week-wide totals by type.
  totals: CellBreakdown;
}

// Map the short weekday name to a Monday-first row index, matching the
// M T W T F S S ordering.
const WEEKDAY_TO_ROW: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6
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
    hourCycle: "h23"
  });
}

function emptyCell(): CellBreakdown {
  return { commits: 0, pullRequests: 0, issues: 0 };
}

function createEmptyGrid(): CellBreakdown[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, emptyCell));
}

function cellTotal(cell: CellBreakdown): number {
  return cell.commits + cell.pullRequests + cell.issues;
}

// The current week's bounds, as local (timezone) YYYY-MM-DD strings.
function currentWeekRange(formatter: Intl.DateTimeFormat): {
  weekStart: string;
  today: string;
} {
  const parts = formatter.formatToParts(new Date());
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const dayIndex = WEEKDAY_TO_ROW[get("weekday")] ?? 0;

  const today = `${get("year")}-${get("month")}-${get("day")}`;
  // Whole-day arithmetic in UTC to find Monday of the current week.
  const monday = new Date(Date.UTC(year, month - 1, day));
  monday.setUTCDate(monday.getUTCDate() - dayIndex);
  const weekStart = monday.toISOString().slice(0, 10);

  return { weekStart, today };
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

  const row = WEEKDAY_TO_ROW[weekday];
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
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${url}`);
  }

  return response.json() as Promise<T>;
}

interface GitHubEvent {
  created_at: string;
  payload: {
    ref?: string;
    head?: string;
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

/**
 * Builds a day-of-week × hour-of-day heatmap of the user's GitHub
 * contributions — commits pushed (to any branch), pull requests opened, and
 * issues opened — for the current week (Monday → now) in the given `timeZone`.
 * Each cell carries a per-type breakdown. Only aggregate timing counts are
 * produced; repo names and content are never surfaced.
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
 *
 * Requires `GITHUB_TOKEN` (classic PAT, `repo` + `read:user`) and
 * `GITHUB_USERNAME`. Returns an empty grid if either is missing or a request
 * fails, so the page degrades gracefully.
 */
export async function getContributionHeatmap({
  timeZone
}: {
  timeZone: string;
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
  const { weekStart, today } = currentWeekRange(formatter);
  const grid = createEmptyGrid();
  const totals = emptyCell();

  try {
    const [events, issues] = await Promise.all([
      fetchWeekEvents(token, username, weekStart),
      fetchWeekIssues(token, username, weekStart)
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

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

// X-axis runs 6am → 5am the next day: hours 6,7,…,23,0,…,5 across the columns.
const START_HOUR = 6;
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

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

// Grayscale intensity steps, lightest → darkest (opacity of --foreground).
const LEVEL_CLASSES = [
  "bg-foreground/[0.06]",
  "bg-foreground/20",
  "bg-foreground/40",
  "bg-foreground/60",
  "bg-foreground/85"
];

// Column positions (every 6 hours) to label on the x-axis.
const LABEL_POSITIONS = [0, 6, 12, 18];

function levelFor(count: number, max: number): number {
  if (count <= 0 || max <= 0) {
    return 0;
  }
  const ratio = count / max;
  if (ratio > 0.75) {
    return 4;
  }
  if (ratio > 0.5) {
    return 3;
  }
  if (ratio > 0.25) {
    return 2;
  }
  return 1;
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

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

function HeatmapCell({
  cell,
  dayIndex,
  hour,
  max
}: {
  cell: CellBreakdown;
  dayIndex: number;
  hour: number;
  max: number;
}) {
  const total = cell.commits + cell.pullRequests + cell.issues;
  const lines = [
    cell.commits > 0 ? plural(cell.commits, "commit") : null,
    cell.pullRequests > 0 ? plural(cell.pullRequests, "pull request") : null,
    cell.issues > 0 ? plural(cell.issues, "issue") : null
  ].filter((line): line is string => line !== null);

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`${DAY_NAMES[dayIndex]} ${hourLabel(hour)}`}
        className={cn(CELL_CLASS, LEVEL_CLASSES[levelFor(total, max)])}
        type="button"
      />
      <TooltipContent className="flex flex-col gap-0.5">
        <span className="font-medium">
          {DAY_NAMES[dayIndex]} {hourLabel(hour)}
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

function GithubHourlyContributionsGrid({
  grid,
  max,
  totals
}: ContributionHeatmap) {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3 overflow-x-auto">
        <div
          aria-label="Heatmap of GitHub contributions by day of week and hour of day"
          className={cn(ROW_STACK, GRID_WIDTH)}
          role="img"
        >
          {grid.map((row, dayIndex) => (
            <div
              className={cn("grid items-center gap-1 md:gap-2", GRID_COLS)}
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed 7-day order
              key={dayIndex}
            >
              <span className="text-muted-foreground text-xs">
                {DAY_LABELS[dayIndex]}
              </span>
              {HOUR_ORDER.map((hour) => (
                <HeatmapCell
                  cell={row[hour]}
                  dayIndex={dayIndex}
                  hour={hour}
                  key={hour}
                  max={max}
                />
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
            {LABEL_POSITIONS.map((position, index) => {
              const isLast = index === LABEL_POSITIONS.length - 1;
              return (
                <span
                  className={cn("col-span-6", isLast && "flex justify-between")}
                  key={position}
                >
                  <span>{shortHour(HOUR_ORDER[position])}</span>
                  {/* The final block also labels the wrap-around end (5am). */}
                  {isLast ? <span>{shortHour(HOUR_ORDER[23])}</span> : null}
                </span>
              );
            })}
          </div>
        </div>
        <span className="text-muted-foreground text-sm">
          {plural(totals.commits, "commit")} pushed,{" "}
          {plural(totals.pullRequests, "pull request")} opened,{" "}
          {plural(totals.issues, "issue")} opened
        </span>
      </div>
    </TooltipProvider>
  );
}

// Loading state mirroring the grid's layout so the page doesn't shift when the
// data resolves.
export function GithubHourlyContributionsSkeleton() {
  return (
    <div className="flex flex-col gap-3 overflow-x-auto">
      <div className={cn(ROW_STACK, GRID_WIDTH)}>
        {DAY_LABELS.map((label, dayIndex) => (
          <div
            className={cn("grid items-center gap-1 md:gap-2", GRID_COLS)}
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed 7-day order
            key={dayIndex}
          >
            <span className="text-muted-foreground text-xs">{label}</span>
            {HOUR_ORDER.map((hour) => (
              <Skeleton className={CELL_CLASS} key={hour} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export async function GithubHourlyContributions({
  timeZone = "America/Los_Angeles"
}: {
  timeZone?: string;
} = {}) {
  const data = await getContributionHeatmap({ timeZone });
  return <GithubHourlyContributionsGrid {...data} />;
}
