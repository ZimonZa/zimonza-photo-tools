import Link from "next/link";
import { ArrowLeft, ImageOff } from "lucide-react";

export default function NotFound() {
  return (
    <div className="relative overflow-hidden">
      <div className="bg-glow pointer-events-none absolute inset-x-0 top-0 h-[400px]" />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 py-28 text-center">
        <span className="animate-float flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/20 to-accent2/20 text-accent ring-1 ring-inset ring-accent/20">
          <ImageOff className="h-8 w-8" />
        </span>
        <h1 className="mt-6 font-display text-5xl font-bold tracking-tight">
          4<span className="gradient-text">0</span>4
        </h1>
        <p className="mt-3 max-w-sm text-muted-foreground">
          This page doesn&apos;t exist — but your photos are still waiting to be
          perfected.
        </p>
        <Link
          href="/"
          className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent2 px-6 py-3 text-sm font-semibold text-accent-foreground shadow-glow transition-all duration-200 hover:shadow-glow-lg"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to the tools
        </Link>
      </div>
    </div>
  );
}
