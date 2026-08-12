# @wasimxyz/ui

A [shadcn/ui registry](https://ui.shadcn.com/docs/registry) of components I use on [wasimamiri.com](https://wasimamiri.com). Install any item with the shadcn CLI — its files, dependencies, and required env vars come with it.

## Install

**Via the GitHub address** (no configuration needed):

```bash
npx shadcn@latest add wasimxyz/ui/fetch-github-contributions
```

Or install just the calendar:

```bash
npx shadcn@latest add wasimxyz/ui/week-activity-calendar
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
npx shadcn@latest add @wasimxyz/fetch-github-contributions
```

## Developing this registry

```bash
npm install
npm run registry:build   # writes public/registry/<item>.json from registry.json
```

The built JSON under `public/registry/` is committed (the component source lives under `registry/`) so the `@wasimxyz` namespace can resolve items from raw GitHub.
