import useSWR, { useSWRConfig } from "swr";

import { ProductList } from "./ProductList";

type Product = {
  readonly id: string;
  readonly name: string;
};

async function fetchProducts(): Promise<readonly Product[]> {
  const response = await fetch("/api/products");
  return response.json() as Promise<readonly Product[]>;
}

async function archiveProduct(productId: string): Promise<void> {
  await fetch(`/api/products/${productId}/archive`, {
    method: "POST",
  });
}

export function ProductSWRPanel() {
  const { mutate } = useSWRConfig();
  const { data: products = [] } = useSWR("/api/products", fetchProducts);

  async function handleArchiveProduct() {
    await archiveProduct(products[0]?.id ?? "product-1");
    mutate("/api/product");
  }

  return (
    <section aria-label="SWR product workspace">
      <button type="button" aria-label="Archive product SWR" onClick={handleArchiveProduct}>
        Archive SWR
      </button>
      <ProductList products={products} />
    </section>
  );
}
