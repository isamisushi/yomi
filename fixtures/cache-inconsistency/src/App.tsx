import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { createYomiAction, useYomiRenderTrace, type YomiTraceMetadata } from "./yomi/react";
import { createYomiTanStackQueryClient } from "./yomi/tanstack-query";

type Product = {
  readonly id: string;
  readonly name: string;
};

const archiveActionTrace: YomiTraceMetadata = {
  name: "archive product",
  source: {
    file: "src/App.tsx",
    line: 89,
    symbol: "onClick",
  },
  graphNodeId: "product-archive-panel-on-click-1-action",
  correlationId: "cache-inconsistency",
};

const cacheSource = {
  file: "src/App.tsx",
  line: 68,
  symbol: "invalidateQueries",
} as const;

const productListSource = {
  file: "src/App.tsx",
  line: 41,
  symbol: "ProductArchivePanel",
} as const;

export function ProductArchivePanel() {
  const [serverProducts, setServerProducts] = useState<readonly Product[]>([
    { id: "paper", name: "Paper" },
    { id: "pencil", name: "Pencil" },
  ]);
  const queryClient = createYomiTanStackQueryClient(useQueryClient(), {
    invalidate: {
      name: "archive product cache",
      source: cacheSource,
      graphNodeId: "product-archive-panel-invalidate-1-cache",
      correlationId: "cache-inconsistency",
    },
  });
  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => serverProducts,
    initialData: serverProducts,
  });
  const productNames = useMemo(
    () => (products.data ?? []).map((product) => product.name).join(", "),
    [products.data],
  );

  function archivePaper() {
    setServerProducts((currentProducts) =>
      currentProducts.filter((product) => product.id !== "paper"),
    );
    queryClient.invalidateQueries({ queryKey: ["product"] });
  }

  useYomiRenderTrace(
    {
      name: "product archive panel",
      source: productListSource,
      graphNodeId: "product-archive-panel",
      correlationId: "cache-inconsistency",
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
      <button data-testid="archive-paper" onClick={createYomiAction(archiveActionTrace, archivePaper)}>
        Archive Paper
      </button>
    </main>
  );
}

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ProductArchivePanel />
  </QueryClientProvider>,
);
