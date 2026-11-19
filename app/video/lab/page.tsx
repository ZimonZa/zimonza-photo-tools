import type { Metadata } from "next";
import { EngineLab } from "@/components/video/engine-lab";

// Hidden test page for the video engine checkpoint. Not linked from the nav, home page or sitemap.
export const metadata: Metadata = {
  title: "Video engine lab",
  robots: { index: false, follow: false },
};

export default function VideoLabRoute() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight">Video engine lab</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Test page for the new video engine. Pick a clip, choose settings, press Run, then use Copy report and send it
        back.
      </p>
      <div className="mt-6">
        <EngineLab />
      </div>
    </div>
  );
}
