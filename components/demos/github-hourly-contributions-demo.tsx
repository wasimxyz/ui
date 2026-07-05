import { Suspense } from "react";
import { ContributionsDemoControls } from "@/components/demos/contributions-demo-controls";
import {
  CONTRIBUTION_KINDS,
  type ContributionKind,
  GithubHourlyContributions,
  GithubHourlyContributionsSkeleton,
} from "@/registry/wasimxyz/github-hourly-contributions/github-hourly-contributions";

interface SearchParams {
  [key: string]: string | string[] | undefined;
}

function parseWeek(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

function parseTypes(raw: string | string[] | undefined): ContributionKind[] {
  const value = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const requested = new Set(value.split(",").filter(Boolean));
  const selected = CONTRIBUTION_KINDS.filter((kind) => requested.has(kind));
  // Fall back to all kinds when the param is missing or matches nothing.
  return selected.length > 0 ? selected : [...CONTRIBUTION_KINDS];
}

// Demo-only wrapper: reads the `week` / `types` selection from the URL and
// feeds it to the (unmodified) server component. `searchParams` is awaited here
// — inside the page's Suspense boundary — because `cacheComponents` treats it
// as dynamic.
export async function GithubHourlyContributionsDemo({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolved = await searchParams;
  const week = parseWeek(resolved.week);
  const types = parseTypes(resolved.types);

  return (
    <div className="flex flex-col gap-4">
      <ContributionsDemoControls types={types} week={week} />
      {/* Keyed so a filter change re-suspends only the heatmap (showing its
          skeleton), while the controls above stay mounted. */}
      <Suspense
        fallback={<GithubHourlyContributionsSkeleton />}
        key={`${week ?? "current"}|${types.join(",")}`}
      >
        <GithubHourlyContributions types={types} week={week} />
      </Suspense>
    </div>
  );
}
