import { useAtomValue, useSetAtom } from "jotai";

import { inventorySortAtom } from "./inventorySortAtom";
import { InventorySortLabel } from "./InventorySortLabel";

export function InventoryJotaiSortPanel() {
  const sortMode = useAtomValue(inventorySortAtom);
  const setSortMode = useSetAtom(inventorySortAtom);

  return (
    <section aria-label="Inventory Jotai sort">
      <button
        type="button"
        aria-label="Sort inventory by priority"
        onClick={() => setSortMode("priority")}
      >
        Sort by priority
      </button>
      <InventorySortLabel sortMode={sortMode} />
    </section>
  );
}
