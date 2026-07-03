import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (Next.js 16) — required by the registry's
  // `github-hourly-contributions` block, which uses the `"use cache"`
  // directive, `cacheLife`/`cacheTag`, and `connection()`.
  cacheComponents: true,
};

export default nextConfig;
