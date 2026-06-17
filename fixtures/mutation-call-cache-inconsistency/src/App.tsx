import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { createYomiAction, useYomiRenderTrace, type YomiTraceMetadata } from "./yomi/react";
import { createYomiTanStackQueryClient } from "./yomi/tanstack-query";

type Product = {
  readonly id: string;
  readonly name: string;
};

const restoreActionTrace: YomiTraceMetadata = {
  name: "restore product mutate call",
  source: {
    file: "src/App.tsx",
    line: 100,
    symbol: "onClick",
  },
  graphNodeId: "product-restore-panel-on-click-1-action",
  correlationId: "mutation-call-cache-inconsistency",
};

const cacheSource = {
  file: "src/App.tsx",
  line: 75,
  symbol: "invalidateQueries",
} as const;

const productListSource = {
  file: "src/App.tsx",
  line: 42,
  symbol: "ProductRestorePanel",
} as const;

export function ProductRestorePanel() {
  const [serverProducts, setServerProducts] = useState<readonly Product[]>([
    { id: "paper", name: "Paper" },
    { id: "pencil", name: "Pencil" },
  ]);
  const queryClient = createYomiTanStackQueryClient(useQueryClient(), {
    invalidate: {
      name: "restore product mutate call cache",
      source: cacheSource,
      graphNodeId: "product-restore-panel-invalidate-2-cache",
      correlationId: "mutation-call-cache-inconsistency",
    },
  });
  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => serverProducts,
    initialData: serverProducts,
  });
  const restoreMutation = useMutation({
    mutationFn: async (productId: string) => {
      setServerProducts((currentProducts) =>
        currentProducts.filter((product) => product.id !== productId),
      );
    },
  });
  const productNames = useMemo(
    () => (products.data ?? []).map((product) => product.name).join(", "),
    [products.data],
  );

  function restorePaper() {
    restoreMutation.mutate("paper", {
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: ["product"] });
      },
    });
  }

  useYomiRenderTrace(
    {
      name: "product restore panel",
      source: productListSource,
      graphNodeId: "product-restore-panel",
      correlationId: "mutation-call-cache-inconsistency",
    },
    () => `Visible products rendered as "${productNames}".`,
    [productNames],
  );

  return (
    <main>
      <h1>Products</h1>
      <output data-testid="product-list">{productNames}</output>
      <output data-testid="server-products">
        {serverProducts.map((product) => product.name).join(", ")}
      </output>
      <button
        data-testid="restore-paper"
        onClick={createYomiAction(restoreActionTrace, restorePaper)}
      >
        Restore Paper Mutation Call
      </button>
    </main>
  );
}

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ProductRestorePanel />
  </QueryClientProvider>,
);
