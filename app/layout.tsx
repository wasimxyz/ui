import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "@wasimxyz/ui",
  description: "A demo of the @wasimxyz/ui shadcn registry components.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-10 bg-background/80 backdrop-blur">
            <div className="flex h-14 items-center gap-6 px-6">
              <Link className="font-semibold text-sm" href="/">
                @wasimxyz/ui
              </Link>
            </div>
          </header>
          <div className="flex flex-1">
            <AppSidebar />
            <main className="flex-1">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
