import { connection } from "next/server";
import { Suspense } from "react";
import { ContributionsDemoControls } from "@/components/demos/contributions-demo-controls";
import {
  type ActivityCounts,
  createActivityGrid,
  resolveWeekBounds,
  WeekActivityCalendar,
  WeekActivityCalendarSkeleton,
  type WeekActivitySeries,
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

function parseWeek(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
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

async function WeekActivityCalendarDemoHeatmap({
  kinds,
  week,
}: {
  kinds: DemoKind[];
  week?: string;
}) {
  await connection();

  const timeZone = "America/Los_Angeles";
  const { weekStart, today, weekStartsOn } = resolveWeekBounds({
    timeZone,
    week,
  });
  const github = await fetchGithubContributions({ timeZone, weekStart, today });

  return (
    <WeekActivityCalendar
      kinds={kinds}
      series={[github, sampleMeetingsSeries()]}
      weekStartsOn={weekStartsOn}
    />
  );
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
      <ContributionsDemoControls types={kinds} week={week} />
      <Suspense
        fallback={<WeekActivityCalendarSkeleton />}
        key={week ?? "current"}
      >
        <WeekActivityCalendarDemoHeatmap kinds={kinds} week={week} />
      </Suspense>
    </div>
  );
}
