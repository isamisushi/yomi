import { InventorySortLabel } from "./InventorySortLabel";
import { useInventoryViewStore } from "./inventoryViewStore";

export function InventorySortPanel() {
  const sortMode = useInventoryViewStore((state) => state.sortMode);
  const setSortMode = useInventoryViewStore((state) => state.setSortMode);

  return (
    <section aria-label="Inventory sorting">
      <button type="button" aria-label="Sort by name" onClick={() => setSortMode("name")}>
        Sort by name
      </button>
      <InventorySortLabel sortMode={sortMode} />
    </section>
  );
}
