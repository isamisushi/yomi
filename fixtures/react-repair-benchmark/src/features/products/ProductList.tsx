type ProductListProps = {
  readonly products: readonly {
    readonly id: string;
    readonly name: string;
  }[];
};

export function ProductList({ products }: ProductListProps) {
  return (
    <section aria-label="Product list">
      {products.map((product) => (
        <article key={product.id}>{product.name}</article>
      ))}
    </section>
  );
}
