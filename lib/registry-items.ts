// Client-safe metadata for the registry's demo-able items. This module holds
// NO component imports so it can be pulled into client components (e.g. the
// sidebar) without dragging in the `"server-only"` component source. It mirrors
// the items declared in `registry.json`.

export interface RegistryItem {
  /** One-line description shown under the title. */
  description: string;
  /** URL slug and registry item name. */
  name: string;
  /** Human-readable title shown in the sidebar and preview header. */
  title: string;
}

export const registryItems: readonly RegistryItem[] = [
  {
    name: "week-activity-calendar",
    title: "Week Activity Calendar",
    description:
      "A day-of-week × hour-of-day heatmap that merges activity series (e.g. GitHub contributions and meetings) into one week calendar, with per-cell tooltips and a customizable color scale. Light/dark aware.",
  },
] as const;

export function getRegistryItem(name: string): RegistryItem | undefined {
  return registryItems.find((item) => item.name === name);
}
