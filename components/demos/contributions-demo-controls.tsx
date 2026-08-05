"use client";

import { ChevronDownIcon } from "@radix-ui/react-icons";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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

// Local YYYY-MM-DD for a day `weeksAgo` weeks before today. Only ever called
// from click handlers — never during render — so there's no hydration mismatch
// from reading the clock.
function weeksAgoToYmd(weeksAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - weeksAgo * 7);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

  // The URL is the single source of truth: rebuild it from the desired week +
  // types and let the server component re-render with the new props.
  function navigate(nextWeek: string | undefined, nextTypes: string[]) {
    const params = new URLSearchParams();
    if (nextWeek) {
      params.set("week", nextWeek);
    }
    // Omit `types` when everything is selected — the component defaults to all.
    if (nextTypes.length !== KIND_ORDER.length) {
      params.set("types", nextTypes.join(","));
    }
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    });
  }

  function selectWeek(weeksAgo: number) {
    navigate(weeksAgo === 0 ? undefined : weeksAgoToYmd(weeksAgo), types);
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
    navigate(
      week,
      KIND_ORDER.filter((kind) => selected.has(kind))
    );
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
            <ChevronDownIcon className="size-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Week</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {WEEK_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.label}
              onSelect={() => selectWeek(option.weeksAgo)}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="justify-between gap-2" variant="outline">
            {typesLabel}
            <ChevronDownIcon className="size-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Activity types</DropdownMenuLabel>
          <DropdownMenuSeparator />
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
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
