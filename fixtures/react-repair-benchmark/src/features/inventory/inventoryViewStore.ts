import { create } from "zustand";

type InventorySortMode = "createdAt" | "name";

type InventoryViewState = {
  readonly sortMode: InventorySortMode;
  readonly setSortMode: (sortMode: InventorySortMode) => void;
};

export const useInventoryViewStore = create<InventoryViewState>((set) => ({
  sortMode: "createdAt",
  setSortMode: (sortMode) => set({ sortMode: "createdAt" }),
}));
