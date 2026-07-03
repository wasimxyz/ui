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
    name: "github-hourly-contributions",
    title: "GitHub Hourly Contributions",
    description:
      "A day-of-week × hour-of-day heatmap of a GitHub user's activity for the current week, with per-cell tooltips. Grayscale, light/dark aware.",
  },
] as const;

export function getRegistryItem(name: string): RegistryItem | undefined {
  return registryItems.find((item) => item.name === name);
}
