type InventoryResultsProps = {
  readonly items: readonly {
    readonly id: string;
    readonly name: string;
  }[];
};

export function InventoryResults({ items }: InventoryResultsProps) {
  return (
    <section aria-label="Inventory results">
      {items.map((item) => (
        <article key={item.id}>{item.name}</article>
      ))}
    </section>
  );
}
