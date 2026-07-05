import Link from "next/link";
import { registryItems } from "@/lib/registry-items";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-semibold text-3xl tracking-tight">Components</h1>
      <p className="mt-2 text-muted-foreground">
        Components available in the{" "}
        <span className="font-medium text-foreground">@wasimxyz/ui</span>{" "}
        registry. Select one to preview it.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {registryItems.map((item) => (
          <Link
            className="rounded-lg border p-4 transition-colors hover:bg-accent/50"
            href={`/components/${item.name}`}
            key={item.name}
          >
            <h2 className="font-medium">{item.title}</h2>
            <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
              {item.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
