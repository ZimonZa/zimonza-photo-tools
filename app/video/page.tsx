import type { Metadata } from "next";
import { VideoStudio } from "@/components/video/studio/video-studio";

// Not linked from the nav, home page or sitemap yet.
export const metadata: Metadata = {
  title: "Video editor",
  robots: { index: false, follow: false },
};

export default function VideoRoute() {
  return <VideoStudio />;
}
