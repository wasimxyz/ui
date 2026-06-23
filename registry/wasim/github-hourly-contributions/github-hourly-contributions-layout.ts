// Layout constants shared by the interactive heatmap grid and its loading
// skeleton. Kept in a neutral (non-"use client") module so the static skeleton
// can stay a server component instead of being pulled into the client bundle.

export const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

// X-axis runs 6am → 5am the next day: hours 6,7,…,23,0,…,5 across the columns.
export const START_HOUR = 6;
export const HOUR_ORDER = Array.from(
  { length: 24 },
  (_, index) => (index + START_HOUR) % 24
);

// 25 columns: a fixed day-label column + 24 hour columns.
export const GRID_COLS = "grid-cols-[1rem_repeat(24,minmax(0,1fr))]";

export const GRID_WIDTH = "min-w-[320px]";

// Squares fill their column (full width); intensity is set per cell.
export const CELL_CLASS = "aspect-square rounded-sm";

export const ROW_STACK = "flex flex-col gap-1.5";
