import useSWR from "swr";

import { ProductList } from "./ProductList";

type Product = {
  readonly id: string;
  readonly name: string;
};

async function fetchProducts(): Promise<readonly Product[]> {
  const response = await fetch("/api/products");
  return response.json() as Promise<readonly Product[]>;
}

async function archiveProduct(productId: string): Promise<readonly Product[]> {
  const response = await fetch(`/api/products/${productId}/archive`, {
    method: "POST",
  });
  return response.json() as Promise<readonly Product[]>;
}

export function ProductSWROptimisticPanel() {
  const { data: products = [], mutate: mutateProducts } = useSWR(
    "/api/products",
    fetchProducts,
  );

  function handleArchiveProduct() {
    const productId = products[0]?.id ?? "product-1";
    mutateProducts(() => archiveProduct(productId), {
      optimisticData: products.filter((product) => product.id !== productId),
      rollbackOnError: false,
      revalidate: false,
    });
  }

  return (
    <section aria-label="SWR optimistic product workspace">
      <button
        type="button"
        aria-label="Archive product optimistically"
        onClick={handleArchiveProduct}
      >
        Archive Optimistic
      </button>
      <ProductList products={products} />
    </section>
  );
}
