import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getRegistryItem, registryItems } from "@/lib/registry-items";
import { getRegistryRender } from "@/lib/registry-render";

interface PageParams {
  name: string;
}

interface DemoSearchParams {
  [key: string]: string | string[] | undefined;
}

export function generateStaticParams(): PageParams[] {
  return registryItems.map((item) => ({ name: item.name }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { name } = await params;
  const item = getRegistryItem(name);
  if (!item) {
    return { title: "Not found — @wasimxyz/ui" };
  }
  return {
    title: `${item.title} — @wasimxyz/ui`,
    description: item.description,
  };
}

/** Shared chrome for the App Shell — no URL data, reusable across `[name]` links. */
function ComponentPageSkeleton() {
  return (
    <>
      <header className="mb-8">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="mt-2 h-5 w-full max-w-xl" />
      </header>
      <div className="w-full">
        <Skeleton className="h-64 w-full" />
      </div>
    </>
  );
}

async function ComponentPageBody({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<DemoSearchParams>;
}) {
  const { name } = await params;
  const item = getRegistryItem(name);
  const render = getRegistryRender(name);

  if (!(item && render)) {
    notFound();
  }

  const { Component, Skeleton: DemoSkeleton, Demo } = render;

  return (
    <>
      <header className="mb-8">
        <h1 className="font-semibold text-3xl tracking-tight">{item.title}</h1>
        <p className="mt-2 text-muted-foreground">{item.description}</p>
      </header>

      <div className="w-full">
        {/* Nested so searchParams-driven updates keep the header mounted. */}
        <Suspense fallback={<DemoSkeleton />}>
          {Demo ? <Demo searchParams={searchParams} /> : <Component />}
        </Suspense>
      </div>
    </>
  );
}

export default function ComponentPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<DemoSearchParams>;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Suspense fallback={<ComponentPageSkeleton />}>
        <ComponentPageBody params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
