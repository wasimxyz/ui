import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (Next.js 16) — required by registry loaders that use
  // the `"use cache"` directive, `cacheLife`/`cacheTag`, and `connection()`.
  cacheComponents: true,
  // Partial Prefetching (Next.js 16.3) — one reusable App Shell per route, plus
  // per-link runtime prefetch via `<Link prefetch>` for searchParams-driven UI.
  partialPrefetching: true,
};

export default nextConfig;
