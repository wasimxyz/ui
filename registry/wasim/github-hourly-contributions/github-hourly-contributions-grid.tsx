"use client";

import {
  CELL_CLASS,
  DAY_LABELS,
  GRID_COLS,
  GRID_WIDTH,
  HOUR_ORDER,
  ROW_STACK
} from "@/components/github-hourly-contributions-layout";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import type {
  CellBreakdown,
  ContributionHeatmap
} from "@/lib/github-hourly-contributions-data";
import { cn } from "@/lib/utils";

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

// Grayscale intensity steps, lightest → darkest (opacity of --foreground).
const LEVEL_CLASSES = [
  "bg-foreground/[0.06]",
  "bg-foreground/20",
  "bg-foreground/40",
  "bg-foreground/60",
  "bg-foreground/85"
];

// Column positions (every 6 hours) to label on the x-axis.
const LABEL_POSITIONS = [0, 6, 12, 18];

function levelFor(count: number, max: number): number {
  if (count <= 0 || max <= 0) {
    return 0;
  }
  const ratio = count / max;
  if (ratio > 0.75) {
    return 4;
  }
  if (ratio > 0.5) {
    return 3;
  }
  if (ratio > 0.25) {
    return 2;
  }
  return 1;
}

function hourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour} ${period}`;
}

// Compact x-axis label, e.g. "6a", "12p".
function shortHour(hour: number): string {
  const period = hour < 12 ? "a" : "p";
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}${period}`;
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

function HeatmapCell({
  cell,
  dayIndex,
  hour,
  max
}: {
  cell: CellBreakdown;
  dayIndex: number;
  hour: number;
  max: number;
}) {
  const total = cell.commits + cell.pullRequests + cell.issues;
  const lines = [
    cell.commits > 0 ? plural(cell.commits, "commit") : null,
    cell.pullRequests > 0 ? plural(cell.pullRequests, "pull request") : null,
    cell.issues > 0 ? plural(cell.issues, "issue") : null
  ].filter((line): line is string => line !== null);

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`${DAY_NAMES[dayIndex]} ${hourLabel(hour)}`}
        className={cn(CELL_CLASS, LEVEL_CLASSES[levelFor(total, max)])}
        type="button"
      />
      <TooltipContent className="flex flex-col gap-0.5">
        <span className="font-medium">
          {DAY_NAMES[dayIndex]} {hourLabel(hour)}
        </span>
        {lines.length > 0 ? (
          lines.map((line) => <span key={line}>{line}</span>)
        ) : (
          <span>No contributions</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function GithubHourlyContributionsGrid({
  grid,
  max,
  totals
}: ContributionHeatmap) {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3 overflow-x-auto">
        <div
          aria-label="Heatmap of GitHub contributions by day of week and hour of day"
          className={cn(ROW_STACK, GRID_WIDTH)}
          role="img"
        >
          {grid.map((row, dayIndex) => (
            <div
              className={cn("grid items-center gap-1 md:gap-2", GRID_COLS)}
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed 7-day order
              key={dayIndex}
            >
              <span className="text-muted-foreground text-xs">
                {DAY_LABELS[dayIndex]}
              </span>
              {HOUR_ORDER.map((hour) => (
                <HeatmapCell
                  cell={row[hour]}
                  dayIndex={dayIndex}
                  hour={hour}
                  key={hour}
                  max={max}
                />
              ))}
            </div>
          ))}
          <div
            className={cn(
              "grid gap-1 pt-1 text-muted-foreground text-xs md:gap-2",
              GRID_COLS
            )}
          >
            <span />
            {LABEL_POSITIONS.map((position, index) => {
              const isLast = index === LABEL_POSITIONS.length - 1;
              return (
                <span
                  className={cn("col-span-6", isLast && "flex justify-between")}
                  key={position}
                >
                  <span>{shortHour(HOUR_ORDER[position])}</span>
                  {/* The final block also labels the wrap-around end (5am). */}
                  {isLast ? <span>{shortHour(HOUR_ORDER[23])}</span> : null}
                </span>
              );
            })}
          </div>
        </div>
        <span className="text-muted-foreground text-sm">
          {plural(totals.commits, "commit")} pushed,{" "}
          {plural(totals.pullRequests, "pull request")} opened,{" "}
          {plural(totals.issues, "issue")} opened
        </span>
      </div>
    </TooltipProvider>
  );
}
