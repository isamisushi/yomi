import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

export function ProductArchivePanel() {
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
  });
  const archiveMutation = useMutation({
    mutationFn: archiveProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product"] });
    },
  });

  return (
    <section aria-label="Product archive workspace">
      <button
        type="button"
        aria-label="Archive product"
        onClick={() => archiveMutation.mutate(products[0]?.id ?? "product-1")}
      >
        Archive
      </button>
      <ProductList products={products} />
    </section>
  );
}
