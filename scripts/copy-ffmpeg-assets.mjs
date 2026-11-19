// Copies the ffmpeg.wasm single-thread core and its module worker into public/ffmpeg/
// so the static site serves them from its own origin (no CDN). Runs before dev and build.
// public/ffmpeg/ is git-ignored — the ~32 MB wasm is never committed.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modules = join(root, "node_modules", "@ffmpeg");
const out = join(root, "public", "ffmpeg");

function copy(from, toDir) {
  if (!existsSync(from)) {
    console.error(`copy-ffmpeg-assets: missing ${from} — run npm install`);
    process.exit(1);
  }
  mkdirSync(toDir, { recursive: true });
  copyFileSync(from, join(toDir, from.split(/[\\/]/).pop()));
}

const coreDir = join(modules, "core", "dist", "esm");
copy(join(coreDir, "ffmpeg-core.js"), join(out, "core"));
copy(join(coreDir, "ffmpeg-core.wasm"), join(out, "core"));

const workerDir = join(modules, "ffmpeg", "dist", "esm");
if (!existsSync(workerDir)) {
  console.error(`copy-ffmpeg-assets: missing ${workerDir} — run npm install`);
  process.exit(1);
}
for (const name of readdirSync(workerDir)) {
  if (name.endsWith(".js")) copy(join(workerDir, name), join(out, "esm"));
}

console.log("copy-ffmpeg-assets: ffmpeg core and worker copied to public/ffmpeg/");
