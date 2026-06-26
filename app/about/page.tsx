import type { Metadata } from "next";
import Link from "next/link";
import { TOOLS } from "@/lib/formats";

export const metadata: Metadata = {
  title: "About",
  description:
    "ZimonZa Photo Tools is a free, private, in-browser toolkit to resize, crop, convert and compress images.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">About</h1>
      <div className="mt-6 space-y-4 text-muted-foreground">
        <p>
          ZimonZa Photo Tools is a small, fast collection of image utilities that
          run entirely in your browser. No sign-up, no watermarks, no uploads —
          just drop a file and get to work.
        </p>
        <p>
          Everything is processed on your own device using modern web
          technology, which keeps your photos private and makes the tools
          instant and free to use.
        </p>
      </div>

      <h2 className="mt-10 text-xl font-semibold">The tools</h2>
      <ul className="mt-4 space-y-2">
        {TOOLS.map((tool) => (
          <li key={tool.href}>
            <Link href={tool.href} className="text-accent hover:underline">
              {tool.title}
            </Link>
            <span className="text-muted-foreground"> — {tool.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
