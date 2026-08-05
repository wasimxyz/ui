"server-only";

import { cacheLife, cacheTag } from "next/cache";
import type {
  ActivityCounts,
  ActivityKindMeta,
  WeekActivitySeries,
} from "@/components/week-activity-calendar";
import { createPartsFormatter } from "@/components/week-activity-calendar";

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

export type GithubContributionKind =
  | "commits"
  | "pullRequests"
  | "issues"
  | "issuesClosed"
  | "reviews"
  | "repositories";

export const GITHUB_CONTRIBUTION_KINDS: readonly GithubContributionKind[] = [
  "commits",
  "pullRequests",
  "issues",
  "issuesClosed",
  "reviews",
  "repositories",
];

export const GITHUB_KIND_META: Record<
  GithubContributionKind,
  ActivityKindMeta
> = {
  commits: { one: "commit", other: "commits", verb: "pushed" },
  pullRequests: {
    one: "pull request",
    other: "pull requests",
    verb: "opened",
  },
  issues: { one: "issue", other: "issues", verb: "opened" },
  issuesClosed: { one: "issue closed", other: "issues closed" },
  reviews: { one: "review", other: "reviews", verb: "submitted" },
  repositories: { one: "repository", other: "repositories", verb: "created" },
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function emptyCell(): ActivityCounts {
  return {
    commits: 0,
    pullRequests: 0,
    issues: 0,
    issuesClosed: 0,
    reviews: 0,
    repositories: 0,
  };
}

function createEmptyGrid(): ActivityCounts[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, emptyCell));
}

function emptySeries(): WeekActivitySeries {
  return {
    id: "github",
    kinds: GITHUB_CONTRIBUTION_KINDS,
    kindMeta: GITHUB_KIND_META,
    grid: createEmptyGrid(),
    totals: emptyCell(),
  };
}

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

  const localDate = `${year}-${month}-${day}`;
  if (localDate < weekStart || localDate > today) {
    return null;
  }

  const row = WEEKDAY_INDEX[weekday];
  const hour = Number.parseInt(hourValue, 10) % 24;
  if (row === undefined || Number.isNaN(hour)) {
    return null;
  }

  return { row, hour };
}

async function githubFetch<T>(url: string, token: string): Promise<T> {
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
    action?: string;
    head?: string;
    ref?: string;
    ref_type?: string;
  };
  repo: { name: string };
  type: string;
}

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

function latestPushTargets(events: GitHubEvent[]): PushTarget[] {
  const byBranch = new Map<string, PushTarget>();
  for (const event of events) {
    const head = event.payload.head;
    if (event.type !== "PushEvent" || !head) {
      continue;
    }
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
  pull_request?: unknown;
}

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

function record(
  formatter: Intl.DateTimeFormat,
  grid: ActivityCounts[][],
  totals: ActivityCounts,
  isoDate: string,
  kind: GithubContributionKind,
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
  grid[bucket.row][bucket.hour][kind] =
    (grid[bucket.row][bucket.hour][kind] ?? 0) + amount;
  totals[kind] = (totals[kind] ?? 0) + amount;
}

async function recordCommits(
  formatter: Intl.DateTimeFormat,
  grid: ActivityCounts[][],
  totals: ActivityCounts,
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

function recordEventContributions(
  formatter: Intl.DateTimeFormat,
  grid: ActivityCounts[][],
  totals: ActivityCounts,
  events: GitHubEvent[],
  weekStart: string,
  today: string
): void {
  for (const event of events) {
    let kind: GithubContributionKind | null = null;
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
 * Fetches a week of GitHub activity as a `WeekActivitySeries` for
 * `WeekActivityCalendar` — commits pushed, PRs/issues opened, issues closed,
 * reviews submitted, and repositories created.
 *
 * `weekStart` and `today` are passed in (not read from `new Date()` here) on
 * purpose: this function is cached with `use cache`, and a clock read inside
 * that scope would be frozen to build time. Compute bounds at request time via
 * `resolveWeekBounds` from `week-activity-calendar`.
 *
 * Requires `GITHUB_TOKEN` (classic PAT, `repo` + `read:user`) and
 * `GITHUB_USERNAME`. Returns an empty series if either is missing or a request
 * fails.
 */
export async function fetchGithubContributions({
  timeZone,
  weekStart,
  today,
}: {
  timeZone: string;
  weekStart: string;
  today: string;
}): Promise<WeekActivitySeries> {
  "use cache";
  cacheLife({ revalidate: 1800 });
  cacheTag("github-contributions");

  const token = process.env.GITHUB_TOKEN;
  const username = process.env.GITHUB_USERNAME;
  if (!(token && username)) {
    return emptySeries();
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
      const kind: GithubContributionKind = item.pull_request
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
    return emptySeries();
  }

  return {
    id: "github",
    kinds: GITHUB_CONTRIBUTION_KINDS,
    kindMeta: GITHUB_KIND_META,
    grid,
    totals,
  };
}
