import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (Next.js 16) — required by registry loaders that use
  // the `"use cache"` directive, `cacheLife`/`cacheTag`, and `connection()`.
  cacheComponents: true,
};

export default nextConfig;
