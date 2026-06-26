# ZimonZa Photo Tools

A fast, minimalist, **100% client-side** image toolkit — resize, crop, convert and
compress photos right in the browser. Images never leave the device.

## Features

- **Resize** — by exact pixels (with aspect lock), percentage, common presets, or a
  target file size in KB.
- **Crop** — free or locked aspect ratios (1:1, 4:3, 16:9, …), plus rotate & flip.
- **Convert** — accepts HEIC/HEIF, AVIF, JPG, PNG, WebP, GIF, BMP, TIFF, SVG and
  exports to **JPG / PNG / WebP**.
- **Compress** — quality slider or compress-to-target-size.
- **Batch** — drop many images, process them all, download as a ZIP.
- Light/dark mode, responsive, SEO landing pages per tool and per format pair.

## Tech

- Next.js (App Router) + TypeScript + Tailwind CSS
- Zustand (state), react-dropzone (upload), react-easy-crop (crop), pica (high-quality
  resize), heic2any + utif (HEIC/TIFF decode), JSZip + file-saver (batch download)
- Encoding uses the browser's native `canvas.toBlob` (JPG/PNG/WebP); target-size is a
  quality binary search. Heavy decoders/encoders are lazy-loaded only when needed.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
```

## Project structure

```
app/            routes: home, /resize, /crop, /convert, /compress,
                /[conversion] (format-pair SEO pages), sitemap, robots
components/     ImageStudio, dropzone, preview, crop editor, panels, UI primitives
lib/            decode.ts, process.ts (crop/resize/encode/target-size), formats, types
store/          useImageStore.ts (Zustand queue + settings)
```

## Deploy

Deploys as a static-friendly Next.js app — push to Vercel (or any Node host) and it
just works. Update `metadataBase` / sitemap base URL in `app/layout.tsx`,
`app/sitemap.ts` and `app/robots.ts` to your domain.

## Notes / future enhancements

- Move heavy processing into Web Workers (OffscreenCanvas) for large batches.
- Optional `@jsquash` (MozJPEG/OxiPNG) WASM encoders for even smaller files.
- More format-pair landing pages and "resize to N KB" long-tail SEO pages.
