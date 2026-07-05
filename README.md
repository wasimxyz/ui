# @wasimxyz/ui

A [shadcn/ui registry](https://ui.shadcn.com/docs/registry) of components I use on [wasimamiri.com](https://wasimamiri.com). Install any item with the shadcn CLI — its files, dependencies, and required env vars come with it.

## Components

### `github-hourly-contributions`

A day-of-week × hour-of-day heatmap of a GitHub user's activity for the current week — commits pushed, pull requests opened, and issues opened — with a per-cell tooltip breakdown. Grayscale, light/dark aware, with a matching loading skeleton.

![GitHub Hourly Contributions heatmap](https://github.com/wasimxyz/wasimamiri.com/pull/33)

## Install

**Via the GitHub address** (no configuration needed):

```bash
npx shadcn@latest add wasimxyz/ui/github-hourly-contributions
```

**Via the `@wasimxyz` namespace** — add this to your project's `components.json`, then install by name:

```json
{
  "registries": {
    "@wasimxyz": "https://raw.githubusercontent.com/wasimxyz/ui/main/public/registry/{name}.json"
  }
}
```

## Usage

```bash
npx shadcn@latest add @wasimxyz/github-hourly-contributions
```

## Developing this registry

```bash
npm install
npm run registry:build   # writes public/registry/<item>.json from registry.json
```

The built JSON under `public/registry/` is committed (the component source lives under `registry/`) so the `@wasimxyz` namespace can resolve items from raw GitHub.
