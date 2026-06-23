import {
  CELL_CLASS,
  DAY_LABELS,
  GRID_COLS,
  GRID_WIDTH,
  HOUR_ORDER,
  ROW_STACK
} from "@/components/github-hourly-contributions-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function GithubHourlyContributionsSkeleton() {
  return (
    <div className="flex flex-col gap-3 overflow-x-auto">
      <div className={cn(ROW_STACK, GRID_WIDTH)}>
        {DAY_LABELS.map((label, dayIndex) => (
          <div
            className={cn("grid items-center gap-1 md:gap-2", GRID_COLS)}
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed 7-day order
            key={dayIndex}
          >
            <span className="text-muted-foreground text-xs">{label}</span>
            {HOUR_ORDER.map((hour) => (
              <Skeleton className={CELL_CLASS} key={hour} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
