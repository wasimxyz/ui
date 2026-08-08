import { connection } from "next/server";
import { Suspense } from "react";
import { ContributionsDemoControls } from "@/components/demos/contributions-demo-controls";
import {
  type ActivityCounts,
  createActivityGrid,
  resolveWeekBounds,
  WEEK_START_INDEX,
  WeekActivityCalendar,
  WeekActivityCalendarSkeleton,
  type WeekActivitySeries,
  weekBoundsFromStart,
} from "@/components/week-activity-calendar";
import {
  fetchGithubContributions,
  GITHUB_CONTRIBUTION_KINDS,
} from "@/lib/fetch-github-contributions";

interface SearchParams {
  [key: string]: string | string[] | undefined;
}

const DEMO_KINDS = [...GITHUB_CONTRIBUTION_KINDS, "meetings"] as const;
type DemoKind = (typeof DEMO_KINDS)[number];

const TIME_ZONE = "America/Los_Angeles";
const WEEK_STARTS_ON = "sunday" as const;
const WEEK_YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Reads `?week=` as a real calendar date and snaps it to its week start, so the
 * seven days of a week share one cache entry instead of seven. `Date.UTC` rolls
 * nonsense like `2026-99-99` over into a valid date, hence the round-trip check.
 */
function parseWeek(raw: string | string[] | undefined): string | undefined {
  if (typeof raw !== "string") {
    return;
  }
  const match = WEEK_YMD.exec(raw);
  if (!match) {
    return;
  }
  const utc = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
  if (utc.toISOString().slice(0, 10) !== raw) {
    return;
  }
  return weekBoundsFromStart({ weekStart: raw, weekStartsOn: WEEK_STARTS_ON })
    .weekStart;
}

function parseKinds(raw: string | string[] | undefined): DemoKind[] {
  const value = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const requested = new Set(value.split(",").filter(Boolean));
  const selected = DEMO_KINDS.filter((kind) => requested.has(kind));
  return selected.length > 0 ? [...selected] : [...DEMO_KINDS];
}

/** Demo-only second series so the calendar merge path is exercised. */
function sampleMeetingsSeries(): WeekActivitySeries {
  const grid = createActivityGrid();
  const totals: ActivityCounts = { meetings: 0 };

  // Mon 10am, Wed 2pm, Fri 9am — illustrative meeting slots.
  const slots: Array<{ row: number; hour: number; count: number }> = [
    { row: 1, hour: 10, count: 1 },
    { row: 3, hour: 14, count: 2 },
    { row: 5, hour: 9, count: 1 },
  ];

  for (const { row, hour, count } of slots) {
    grid[row][hour] = { meetings: count };
    totals.meetings += count;
  }

  return {
    id: "meetings",
    kinds: ["meetings"],
    kindMeta: {
      meetings: { one: "meeting", other: "meetings", verb: "scheduled" },
    },
    grid,
    totals,
  };
}

/**
 * URL-driven heatmap: no clock read, so `fetchGithubContributions` (`"use
 * cache"`) can resolve during a runtime prefetch and land in the client cache.
 */
async function WeekHeatmap({
  kinds,
  weekStart,
}: {
  kinds: DemoKind[];
  weekStart: string;
}) {
  const bounds = weekBoundsFromStart({
    weekStart,
    weekStartsOn: WEEK_STARTS_ON,
  });
  const github = await fetchGithubContributions({
    timeZone: TIME_ZONE,
    weekStart: bounds.weekStart,
    today: bounds.today,
  });

  return (
    <WeekActivityCalendar
      kinds={kinds}
      series={[github, sampleMeetingsSeries()]}
      weekStartsOn={bounds.weekStartsOn}
    />
  );
}

/** Bare-URL path: read the clock once, then reuse the URL-driven renderer. */
async function CurrentWeekHeatmap({ kinds }: { kinds: DemoKind[] }) {
  await connection();
  const { weekStart } = resolveWeekBounds({
    timeZone: TIME_ZONE,
    weekStartsOn: WEEK_STARTS_ON,
  });
  return <WeekHeatmap kinds={kinds} weekStart={weekStart} />;
}

export async function WeekActivityCalendarDemo({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolved = await searchParams;
  const week = parseWeek(resolved.week);
  const kinds = parseKinds(resolved.types);

  return (
    <div className="flex flex-col gap-4">
      <ContributionsDemoControls
        timeZone={TIME_ZONE}
        types={kinds}
        week={week}
        weekStartsOn={WEEK_START_INDEX[WEEK_STARTS_ON]}
      />
      <Suspense fallback={<WeekActivityCalendarSkeleton />}>
        {week ? (
          <WeekHeatmap kinds={kinds} weekStart={week} />
        ) : (
          <CurrentWeekHeatmap kinds={kinds} />
        )}
      </Suspense>
    </div>
  );
}
