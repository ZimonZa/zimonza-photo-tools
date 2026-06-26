"use client";

import { ImageIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TOOLS } from "@/lib/formats";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <ImageIcon className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">ZimonZa Photo Tools</span>
        </Link>

        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {TOOLS.map((tool) => {
            const active = pathname === tool.href;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {tool.short}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
