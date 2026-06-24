# @wasimxyz/ui

A [shadcn/ui registry](https://ui.shadcn.com/docs/registry) of components I use
on [wasimamiri.com](https://wasimamiri.com). Install any item with the shadcn
CLI — its files, dependencies, and required env vars come with it.

## Components

### `github-hourly-contributions`

A day-of-week × hour-of-day heatmap of a GitHub user's activity for the current
week — commits pushed, pull requests opened, and issues opened — with a per-cell
tooltip breakdown. Grayscale, light/dark aware, with a matching loading
skeleton.

![GitHub Hourly Contributions heatmap](https://github.com/wasimxyz/wasimamiri.com/pull/33)

## Install

**Via the GitHub address** (no configuration needed):

```bash
npx shadcn@latest add wasimxyz/ui/github-hourly-contributions
```

**Via the `@wasimxyz` namespace** — add this to your project's `components.json`,
then install by name:

```json
{
  "registries": {
    "@wasimxyz": "https://raw.githubusercontent.com/wasimxyz/ui/main/public/registry/{name}.json"
  }
}
```

```bash
npx shadcn@latest add @wasimxyz/github-hourly-contributions
```

Either command also pulls the shadcn `tooltip` and `skeleton` components it
depends on.

## Requirements

- **Next.js App Router** with **Cache Components** enabled — the data loader uses
  the `"use cache"` directive (`cacheComponents: true` / `dynamicIO` in
  `next.config`).
- A Tailwind CSS + shadcn/ui base (provides `cn` from `@/lib/utils` and the
  `--foreground` / `--muted-foreground` / `--primary` theme tokens).
- Two environment variables:
  - `GITHUB_TOKEN` — a classic personal access token with **`repo`** +
    **`read:user`** scope (`repo` is required to include private activity).
  - `GITHUB_USERNAME` — the account to chart.

Only aggregate timing counts are produced; repo names and content are never
surfaced. Without the env vars (or on an API error) the component degrades to an
empty grid.

## Usage

```tsx
import { Suspense } from "react";
import { GithubHourlyContributions } from "@/components/github-hourly-contributions";
import { GithubHourlyContributionsSkeleton } from "@/components/github-hourly-contributions-skeleton";

export default function Page() {
  return (
    <Suspense fallback={<GithubHourlyContributionsSkeleton />}>
      {/* timeZone is optional; defaults to "America/Los_Angeles" */}
      <GithubHourlyContributions timeZone="America/Los_Angeles" />
    </Suspense>
  );
}
```

The current week (Monday → now) and each contribution's bucket are computed in
the given `timeZone`. Results are cached for 30 minutes under the
`github-contributions` cache tag; call `revalidateTag("github-contributions")`
to refresh on demand.

## Developing this registry

```bash
npm install
npm run registry:build   # writes public/registry/<item>.json from registry.json
```

The built JSON under `public/registry/` is committed (the component source lives
under `registry/`) so the `@wasimxyz` namespace can resolve items from raw GitHub.

## License

MIT
