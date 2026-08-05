# @wasimxyz/ui

A [shadcn/ui registry](https://ui.shadcn.com/docs/registry) of components I use on [wasimamiri.com](https://wasimamiri.com). Install any item with the shadcn CLI — its files, dependencies, and required env vars come with it.

## Components

### `week-activity-calendar`

A day-of-week × hour-of-day heatmap that merges one or more activity series into a single week calendar. Each series can carry arbitrary count kinds (commits, meetings, …) with per-cell tooltips and a customizable color scale. Grayscale, light/dark aware, with a matching loading skeleton.

### `fetch-github-contributions`

Server-only loader that returns a `WeekActivitySeries` of a GitHub user's activity for a given week. Pair it with `week-activity-calendar` (and, later, other fetchers) via the `series` prop.

## Install

**Via the GitHub address** (no configuration needed):

```bash
npx shadcn@latest add wasimxyz/ui/week-activity-calendar
npx shadcn@latest add wasimxyz/ui/fetch-github-contributions
```

**Via the `@wasimxyz` namespace** — add this to your project's `components.json`, then install by name:

```json
{
  "registries": {
    "@wasimxyz": "https://raw.githubusercontent.com/wasimxyz/ui/main/public/registry/{name}.json"
  }
}
```

```bash
npx shadcn@latest add @wasimxyz/week-activity-calendar
npx shadcn@latest add @wasimxyz/fetch-github-contributions
```

## Usage

```tsx
import { connection } from "next/server";
import {
  WeekActivityCalendar,
  resolveWeekBounds,
} from "@/components/week-activity-calendar";
import { fetchGithubContributions } from "@/lib/fetch-github-contributions";

export default async function Page() {
  await connection();
  const timeZone = "America/Los_Angeles";
  const { weekStart, today } = resolveWeekBounds({ timeZone });
  const github = await fetchGithubContributions({ timeZone, weekStart, today });

  return <WeekActivityCalendar series={[github]} />;
}
```

Pass additional series (e.g. from a future Google Calendar fetcher) in the same `series` array to show everything on one calendar.

## Developing this registry

```bash
npm install
npm run registry:build   # writes public/registry/<item>.json from registry.json
```

The built JSON under `public/registry/` is committed (the component source lives under `registry/`) so the `@wasimxyz` namespace can resolve items from raw GitHub.
