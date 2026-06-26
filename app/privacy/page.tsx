import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "ZimonZa Photo Tools processes every image locally in your browser. Your photos are never uploaded to a server.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Privacy</h1>
      <div className="mt-6 space-y-4 text-muted-foreground">
        <p>
          ZimonZa Photo Tools is built around a simple principle: your images
          belong to you. Every resize, crop, conversion and compression happens
          entirely inside your web browser.
        </p>
        <p>
          We do not upload, store, or transmit your photos to any server. There
          is no account to create and no file is ever sent over the network for
          processing. When you close the tab, nothing remains.
        </p>
        <p>
          Because the work is done on your device, the tools also keep working
          offline once the page has loaded.
        </p>
      </div>
    </div>
  );
}
