import type { Metadata } from "next";
import { ImageStudio } from "@/components/image-studio";
import { ToolPage, type Faq } from "@/components/tool-page";

export const metadata: Metadata = {
  title: "Image Cropper — Crop Photos Online with Aspect Ratios",
  description:
    "Crop images online freely or with locked aspect ratios (1:1, 4:3, 16:9 and more). Rotate, flip, then export to JPG, PNG or WebP. Private and free.",
};

const faqs: Faq[] = [
  {
    q: "How do I crop an image to a square?",
    a: "Open the Crop tab, choose the 1:1 aspect ratio, then drag and zoom to frame your photo. Export when you're happy with the result.",
  },
  {
    q: "Can I rotate or flip the image too?",
    a: "Yes. Use the rotate and flip buttons in the Crop panel. These are applied to the final exported file.",
  },
  {
    q: "Does cropping keep full resolution?",
    a: "Yes. The crop is applied to the full-resolution image, so you keep maximum quality.",
  },
];

export default function CropRoute() {
  return (
    <ToolPage
      title="Image Cropper"
      description="Crop freely or lock to a ratio, then rotate, flip and export. Full-resolution and private."
      faqs={faqs}
    >
      <ImageStudio tool="crop" />
    </ToolPage>
  );
}
