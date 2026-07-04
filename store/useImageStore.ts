import { create } from "zustand";
import { decodeFile } from "@/lib/decode";
import { makeThumbnail } from "@/lib/process";
import {
  DEFAULT_SETTINGS,
  type CropRect,
  type ImageItem,
  type ProcessSettings,
} from "@/lib/types";

interface ImageStore {
  items: ImageItem[];
  selectedId: string | null;
  settings: ProcessSettings;

  addFiles: (files: File[]) => void;
  removeItem: (id: string) => void;
  clear: () => void;
  select: (id: string) => void;
  updateSettings: (patch: Partial<ProcessSettings>) => void;
  setItemCrop: (id: string, crop: CropRect | null) => void;
}

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export const useImageStore = create<ImageStore>((set, get) => ({
  items: [],
  selectedId: null,
  settings: { ...DEFAULT_SETTINGS },

  addFiles: (files) => {
    const newItems: ImageItem[] = files.map((file) => ({
      id: uid(),
      file,
      name: file.name,
      status: "decoding",
      originalSize: file.size,
    }));

    set((state) => ({
      items: [...state.items, ...newItems],
      selectedId: state.selectedId ?? newItems[0]?.id ?? null,
    }));

    // Decode asynchronously, updating each item as it resolves.
    newItems.forEach(async (item) => {
      try {
        const decoded = await decodeFile(item.file);
        const thumbUrl = makeThumbnail(decoded.source, decoded.width, decoded.height);
        set((state) => ({
          items: state.items.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: "ready",
                  source: decoded.source,
                  width: decoded.width,
                  height: decoded.height,
                  thumbUrl,
                }
              : it
          ),
        }));
      } catch (err) {
        set((state) => ({
          items: state.items.map((it) =>
            it.id === item.id
              ? { ...it, status: "error", error: (err as Error).message }
              : it
          ),
        }));
      }
    });
  },

  removeItem: (id) =>
    set((state) => {
      const items = state.items.filter((it) => it.id !== id);
      let selectedId = state.selectedId;
      if (selectedId === id) {
        selectedId = items.find((it) => it.status === "ready")?.id ?? items[0]?.id ?? null;
      }
      return { items, selectedId };
    }),

  clear: () => set({ items: [], selectedId: null }),

  select: (id) => set({ selectedId: id }),

  updateSettings: (patch) =>
    set((state) => ({ settings: { ...state.settings, ...patch } })),

  setItemCrop: (id, crop) =>
    set((state) => ({
      items: state.items.map((it) => (it.id === id ? { ...it, crop } : it)),
    })),
}));
