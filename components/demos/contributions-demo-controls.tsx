"use client";

import { ChevronDownIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Activity kinds shown in the demo filter (GitHub series + sample meetings).
// Mirrored here so this client control doesn't import server-only modules.
const KIND_OPTIONS = [
  { value: "commits", label: "Commits" },
  { value: "pullRequests", label: "Pull requests" },
  { value: "issues", label: "Issues opened" },
  { value: "issuesClosed", label: "Issues closed" },
  { value: "reviews", label: "Reviews" },
  { value: "repositories", label: "Repositories" },
  { value: "meetings", label: "Meetings" },
] as const;

const KIND_ORDER = KIND_OPTIONS.map((option) => option.value);

// Weeks offered by the week filter, as offsets back from the current week.
const WEEK_OPTIONS = [
  { label: "This week", weeksAgo: 0 },
  { label: "Last week", weeksAgo: 1 },
  { label: "2 weeks ago", weeksAgo: 2 },
  { label: "3 weeks ago", weeksAgo: 3 },
  { label: "4 weeks ago", weeksAgo: 4 },
] as const;

/**
 * Canonical Sunday-start YYYY-MM-DD for a week `weeksAgo` weeks before today.
 * Only computed inside `DropdownMenuContent`, which mounts through a Radix
 * Portal with no `forceMount` — so it never runs during SSR or hydration.
 */
function weeksAgoToWeekStart(weeksAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - weeksAgo * 7);
  // Snap back to Sunday so one week maps to exactly one cache entry.
  date.setDate(date.getDate() - date.getDay());
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildHref(
  pathname: string,
  nextWeek: string | undefined,
  nextTypes: string[]
): string {
  const params = new URLSearchParams();
  if (nextWeek) {
    params.set("week", nextWeek);
  }
  // Omit `types` when everything is selected — the component defaults to all.
  if (nextTypes.length !== KIND_ORDER.length) {
    params.set("types", nextTypes.join(","));
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function ContributionsDemoControls({
  week,
  types,
}: {
  week?: string;
  types: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // Types still use router.replace so the menu can stay open across toggles.
  function navigateTypes(nextTypes: string[]) {
    startTransition(() => {
      router.replace(buildHref(pathname, week, nextTypes), { scroll: false });
    });
  }

  function toggleType(value: string) {
    const selected = new Set(types);
    if (selected.has(value)) {
      // Keep at least one type so the heatmap never renders empty.
      if (selected.size === 1) {
        return;
      }
      selected.delete(value);
    } else {
      selected.add(value);
    }
    navigateTypes(KIND_ORDER.filter((kind) => selected.has(kind)));
  }

  const weekLabel = week ? `Week of ${week}` : "This week";
  const typesLabel =
    types.length === KIND_ORDER.length
      ? "All types"
      : `${types.length} type${types.length === 1 ? "" : "s"}`;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 transition-opacity",
        isPending && "opacity-60"
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="justify-between gap-2" variant="outline">
            {weekLabel}
            <ChevronDownIcon className="opacity-60" data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Week</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {/*
              Hrefs (and the clock they read) are computed here, inside the
              portal-mounted menu content — never during SSR/hydration.
              `prefetch` opts into runtime prefetch so the `"use cache"` heatmap
              resolves before the click; `replace` keeps history clean.
            */}
            {WEEK_OPTIONS.map((option) => {
              const href = buildHref(
                pathname,
                // Always emit an explicit week start so "This week" and a later
                // revisit share the same cache key (no bare-URL / ?week= split).
                weeksAgoToWeekStart(option.weeksAgo),
                types
              );
              return (
                <DropdownMenuItem asChild key={option.label}>
                  <Link href={href} prefetch replace scroll={false}>
                    {option.label}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="justify-between gap-2" variant="outline">
            {typesLabel}
            <ChevronDownIcon className="opacity-60" data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Activity types</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {KIND_OPTIONS.map((option) => (
              <DropdownMenuCheckboxItem
                checked={types.includes(option.value)}
                key={option.value}
                // Keep the menu open so several types can be toggled at once.
                onSelect={(event) => {
                  event.preventDefault();
                  toggleType(option.value);
                }}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
