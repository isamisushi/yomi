export function InventorySortLabel({ sortMode }: { readonly sortMode: string }) {
  return <p aria-label="Inventory sort mode">Sorted by {sortMode}</p>;
}
