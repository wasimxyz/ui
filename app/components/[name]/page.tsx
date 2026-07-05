import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getRegistryItem, registryItems } from "@/lib/registry-items";
import { getRegistryRender } from "@/lib/registry-render";

interface PageParams {
  name: string;
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

export default async function ComponentPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { name } = await params;
  const item = getRegistryItem(name);
  const render = getRegistryRender(name);

  if (!(item && render)) {
    notFound();
  }

  const { Component, Skeleton, Demo } = render;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-semibold text-3xl tracking-tight">{item.title}</h1>
        <p className="mt-2 text-muted-foreground">{item.description}</p>
      </header>

      <div className="w-full">
        {/* `searchParams` is awaited inside `Demo` (under this boundary) so its
            dynamic read stays within Suspense, as `cacheComponents` requires. */}
        <Suspense fallback={<Skeleton />}>
          {Demo ? <Demo searchParams={searchParams} /> : <Component />}
        </Suspense>
      </div>
    </div>
  );
}
