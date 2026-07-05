// Maps a registry item name to the actual component + loading skeleton to
// render in the demo. This imports the `"server-only"` registry source, so it
// must be used ONLY from Server Components (the `/components/[name]` route) —
// never from a Client Component. Metadata lives separately in
// `registry-items.ts` for the client sidebar.

import type { ComponentType, ReactNode } from "react";
import { GithubHourlyContributionsDemo } from "@/components/demos/github-hourly-contributions-demo";
import {
  GithubHourlyContributions,
  GithubHourlyContributionsSkeleton,
} from "@/registry/wasimxyz/github-hourly-contributions/github-hourly-contributions";

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

const renderers: Record<string, RegistryRender> = {
  "github-hourly-contributions": {
    Component: GithubHourlyContributions,
    Skeleton: GithubHourlyContributionsSkeleton,
    Demo: GithubHourlyContributionsDemo,
  },
};

export function getRegistryRender(name: string): RegistryRender | undefined {
  return renderers[name];
}
