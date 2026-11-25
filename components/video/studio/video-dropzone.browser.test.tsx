import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useVideoStore } from "@/store/useVideoStore";
import { VideoDropzone } from "./video-dropzone";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const realOpenFile = useVideoStore.getState().openFile;

beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(VideoDropzone)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useVideoStore.setState({ openFile: realOpenFile });
});

/** Choose files through the dropzone's file input, as a picker or a drop would. */
async function choose(...files: File[]) {
  const input = host.querySelector("input[type=file]") as HTMLInputElement;
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  input.files = dt.files;
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
  });
}

const alert = () => host.querySelector('[role="alert"]');

describe("VideoDropzone", () => {
  test("a file that isn't a video says so instead of doing nothing; a video then opens and clears it", async () => {
    const openFile = vi.fn(async () => {});
    useVideoStore.setState({ openFile });
    await choose(new File(["hello"], "notes.txt", { type: "text/plain" }));
    expect(alert()?.textContent).toBe("That file isn't a video. Pick a video file.");
    expect(openFile).not.toHaveBeenCalled();

    await choose(new File([new Uint8Array(100)], "clip.mp4", { type: "video/mp4" }));
    expect(openFile).toHaveBeenCalledTimes(1);
    expect(alert()).toBeNull();
  });

  test("more than one file asks for one video", async () => {
    const openFile = vi.fn(async () => {});
    useVideoStore.setState({ openFile });
    await choose(
      new File([new Uint8Array(100)], "a.mp4", { type: "video/mp4" }),
      new File([new Uint8Array(100)], "b.mp4", { type: "video/mp4" })
    );
    expect(alert()?.textContent).toBe("Pick one video at a time.");
    expect(openFile).not.toHaveBeenCalled();
  });
});
