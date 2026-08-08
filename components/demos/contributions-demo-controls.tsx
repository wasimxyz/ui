"use client";

import { CheckIcon, ChevronDownIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Start of the week containing now, as YYYY-MM-DD in `timeZone`.
 *
 * The zone is not cosmetic: the browser's own calendar day can already be
 * tomorrow relative to the zone the server buckets activity into, and resolving
 * "this week" against the wrong one links to a week that hasn't started there
 * yet. Pinning both sides to one zone also keeps this render deterministic
 * between SSR and hydration.
 */
function currentWeekStart(timeZone: string, weekStartsOn: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const date = new Date(
    Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")))
  );
  const offset = ((WEEKDAY_INDEX[get("weekday")] ?? 0) - weekStartsOn + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

/** Shift a week-start YYYY-MM-DD back by whole weeks. */
function weeksBefore(weekStart: string, weeks: number): string {
  const [year, month, day] = weekStart.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - weeks * 7);
  return date.toISOString().slice(0, 10);
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

/**
 * `prefetch` opts into a runtime prefetch, which resolves the cached heatmap for
 * this week before the click — but costs a server render per link, so it waits
 * for hover or keyboard focus instead of firing for every option on open.
 */
function WeekMenuItem({
  href,
  label,
  onNavigate,
  selected,
}: {
  href: string;
  label: string;
  onNavigate: () => void;
  selected: boolean;
}) {
  const [intent, setIntent] = useState(false);

  return (
    <DropdownMenuItem asChild>
      <Link
        aria-current={selected ? "page" : undefined}
        href={href}
        onFocus={() => setIntent(true)}
        onNavigate={onNavigate}
        onPointerEnter={() => setIntent(true)}
        prefetch={intent}
        replace
        scroll={false}
      >
        {label}
        <CheckIcon className={cn("ml-auto", !selected && "invisible")} />
      </Link>
    </DropdownMenuItem>
  );
}

export function ContributionsDemoControls({
  week,
  types,
  timeZone,
  weekStartsOn,
}: {
  week?: string;
  types: string[];
  timeZone: string;
  weekStartsOn: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [requestedWeek, setRequestedWeek] = useState<string | null>(null);
  const thisWeek = currentWeekStart(timeZone, weekStartsOn);

  // Selecting a week unmounts the menu, so `useLinkStatus` can't report the
  // pending phase from inside the link. The server render that lands the new
  // `week` is what clears it.
  const isChangingWeek = requestedWeek !== null && requestedWeek !== week;

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

  const weekLabel =
    !week || week === thisWeek ? "This week" : `Week of ${week}`;
  const typesLabel =
    types.length === KIND_ORDER.length
      ? "All types"
      : `${types.length} type${types.length === 1 ? "" : "s"}`;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 transition-opacity",
        (isPending || isChangingWeek) && "opacity-60"
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
            {WEEK_OPTIONS.map((option) => {
              // Every option carries an explicit week start, so "This week" and
              // a later revisit of it share one cache entry.
              const optionWeek = weeksBefore(thisWeek, option.weeksAgo);
              return (
                <WeekMenuItem
                  href={buildHref(pathname, optionWeek, types)}
                  key={option.label}
                  label={option.label}
                  onNavigate={() => setRequestedWeek(optionWeek)}
                  selected={optionWeek === (week ?? thisWeek)}
                />
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
