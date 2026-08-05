// Maps a registry item name to the actual component + loading skeleton to
// render in the demo. This imports registry / server-only sources, so it must
// be used ONLY from Server Components (the `/components/[name]` route) —
// never from a Client Component. Metadata lives separately in
// `registry-items.ts` for the client sidebar.

import type { ComponentType, ReactNode } from "react";
import { WeekActivityCalendarDemo } from "@/components/demos/week-activity-calendar-demo";
import {
  WeekActivityCalendar,
  WeekActivityCalendarSkeleton,
  type WeekActivitySeries,
} from "@/components/week-activity-calendar";

interface DemoSearchParams {
  [key: string]: string | string[] | undefined;
}

export interface RegistryRender {
  /** The demo component to render (async Server Component). */
  Component: ComponentType;
  /**
   * Optional interactive showcase that wraps the component with demo-only
   * controls, driven by the page's URL `searchParams`. Rendered instead of
   * `Component` when present.
   */
  Demo?: ComponentType<{ searchParams: Promise<DemoSearchParams> }>;
  /** The matching loading skeleton, shown as the Suspense fallback. */
  Skeleton: () => ReactNode;
}

function emptyGrid() {
  return Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({}))
  );
}

/** Minimal static series so the bare Component preview has something to show. */
function previewSeries(): WeekActivitySeries {
  const grid = emptyGrid();
  grid[1][10] = { commits: 2 };
  grid[3][14] = { meetings: 1 };
  return {
    id: "preview",
    kinds: ["commits", "meetings"],
    kindMeta: {
      commits: { one: "commit", other: "commits", verb: "pushed" },
      meetings: { one: "meeting", other: "meetings", verb: "scheduled" },
    },
    grid,
    totals: { commits: 2, meetings: 1 },
  };
}

function WeekActivityCalendarPreview() {
  return <WeekActivityCalendar series={[previewSeries()]} />;
}

const renderers: Record<string, RegistryRender> = {
  "week-activity-calendar": {
    Component: WeekActivityCalendarPreview,
    Skeleton: () => <WeekActivityCalendarSkeleton />,
    Demo: WeekActivityCalendarDemo,
  },
};

export function getRegistryRender(name: string): RegistryRender | undefined {
  return renderers[name];
}
