import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ProductList } from "./ProductList";

type Product = {
  readonly id: string;
  readonly name: string;
};

async function fetchArchivedProducts(): Promise<readonly Product[]> {
  const response = await fetch("/api/products/archived");
  return response.json() as Promise<readonly Product[]>;
}

async function restoreProduct(productId: string): Promise<void> {
  await fetch(`/api/products/${productId}/restore`, {
    method: "POST",
  });
}

export function ProductRestorePanel() {
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery({
    queryKey: ["archived-products"],
    queryFn: fetchArchivedProducts,
  });
  const restoreMutation = useMutation({
    mutationFn: restoreProduct,
  });

  return (
    <section aria-label="Product restore workspace">
      <button
        type="button"
        aria-label="Restore product"
        onClick={() =>
          restoreMutation.mutate(products[0]?.id ?? "product-1", {
            onSettled: () => {
              queryClient.invalidateQueries({ queryKey: ["archived-product"] });
            },
          })
        }
      >
        Restore
      </button>
      <ProductList products={products} />
    </section>
  );
}
