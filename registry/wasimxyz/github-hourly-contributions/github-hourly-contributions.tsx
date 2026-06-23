import { GithubHourlyContributionsGrid } from "@/components/github-hourly-contributions-grid";
import { getContributionHeatmap } from "@/lib/github-hourly-contributions-data";

export async function GithubHourlyContributions({
  timeZone = "America/Los_Angeles"
}: {
  timeZone?: string;
} = {}) {
  const data = await getContributionHeatmap({ timeZone });
  return <GithubHourlyContributionsGrid {...data} />;
}
