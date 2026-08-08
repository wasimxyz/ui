"use client";

import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  ActivityCounts,
  ActivityKindMeta,
  ColorScale,
} from "./week-activity-calendar";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const LABEL_POSITIONS = [0, 6, 12, 18] as const;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const GRID_COLS = "grid-cols-[1rem_repeat(24,minmax(0,1fr))]";
const GRID_WIDTH = "min-w-[320px]";
const CELL_CLASS = "aspect-square rounded-sm";
const ROW_STACK = "flex flex-col gap-1.5";

function displayRows(weekStartsOn: number): number[] {
  return Array.from(
    { length: 7 },
    (_, position) => (weekStartsOn + position) % 7
  );
}

function cellTotal(cell: ActivityCounts, kinds: readonly string[]): number {
  return kinds.reduce((sum, kind) => sum + (cell[kind] ?? 0), 0);
}

function levelFor(count: number, max: number, steps: number): number {
  if (count <= 0 || max <= 0 || steps <= 0) {
    return 0;
  }
  const level = Math.ceil((count / max) * steps);
  return Math.min(level, steps);
}

function hourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour} ${period}`;
}

function shortHour(hour: number): string {
  const period = hour < 12 ? "a" : "p";
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}${period}`;
}

function countNoun(meta: ActivityKindMeta, count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? meta.one : meta.other}`;
}

function HourAxis() {
  return (
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
            <span>{shortHour(position)}</span>
            {isLast ? <span>{shortHour(23)}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

interface TipState {
  lines: string[];
  rect: DOMRect;
  title: string;
}

export function WeekActivityHeatmap({
  ariaLabel,
  colorScale,
  emptyLabel,
  grid,
  kindMeta,
  kinds,
  max,
  startIndex,
}: {
  ariaLabel: string;
  colorScale: ColorScale;
  emptyLabel: string;
  grid: ActivityCounts[][];
  kindMeta: Record<string, ActivityKindMeta>;
  kinds: readonly string[];
  max: number;
  startIndex: number;
}) {
  const [tip, setTip] = useState<TipState | null>(null);

  return (
    <TooltipProvider>
      <section
        aria-label={ariaLabel}
        className={cn(ROW_STACK, GRID_WIDTH)}
        onPointerLeave={() => setTip(null)}
      >
        {displayRows(startIndex).map((dataRow) => (
          <div
            className={cn("grid items-center gap-1 md:gap-2", GRID_COLS)}
            key={dataRow}
          >
            <span className="text-muted-foreground text-xs">
              {WEEKDAY_LABELS[dataRow]}
            </span>
            {HOURS.map((hour) => {
              const cell = grid[dataRow][hour];
              const total = cellTotal(cell, kinds);
              const level = levelFor(total, max, colorScale.length - 1);
              const lines = kinds
                .filter((kind) => (cell[kind] ?? 0) > 0)
                .map((kind) => {
                  const meta = kindMeta[kind] ?? { one: kind, other: kind };
                  return countNoun(meta, cell[kind] ?? 0);
                });

              return (
                <div
                  className={cn(CELL_CLASS, colorScale[level])}
                  key={hour}
                  onPointerEnter={(event) => {
                    setTip({
                      title: `${DAY_NAMES[dataRow]} ${hourLabel(hour)}`,
                      lines,
                      rect: event.currentTarget.getBoundingClientRect(),
                    });
                  }}
                />
              );
            })}
          </div>
        ))}
        <HourAxis />
      </section>

      {tip ? (
        <Tooltip
          onOpenChange={(open) => {
            if (!open) {
              setTip(null);
            }
          }}
          open
        >
          <TooltipTrigger asChild>
            <span
              aria-hidden
              className="pointer-events-none fixed"
              style={{
                top: tip.rect.top,
                left: tip.rect.left,
                width: tip.rect.width,
                height: tip.rect.height,
              }}
            />
          </TooltipTrigger>
          <TooltipContent className="flex flex-col gap-0.5">
            <span className="font-medium">{tip.title}</span>
            {tip.lines.length > 0 ? (
              tip.lines.map((line) => <span key={line}>{line}</span>)
            ) : (
              <span>{emptyLabel}</span>
            )}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </TooltipProvider>
  );
}
