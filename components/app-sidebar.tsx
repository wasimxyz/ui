"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { registryItems } from "@/lib/registry-items";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0">
      <nav className="sticky top-0 flex flex-col gap-1 p-4">
        <p className="px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Components
        </p>
        <ul className="flex flex-col gap-0.5">
          {registryItems.map((item) => {
            const href = `/components/${item.name}`;
            const isActive = pathname === href;
            return (
              <li key={item.name}>
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                  href={href}
                >
                  {item.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
