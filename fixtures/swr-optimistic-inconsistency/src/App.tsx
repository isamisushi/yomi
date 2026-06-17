import { useMemo } from "react";
import { createRoot } from "react-dom/client";
import useSWR, { SWRConfig } from "swr";

import { createYomiAction, useYomiRenderTrace, type YomiTraceMetadata } from "./yomi/react";
import { recordRuntimeTrace } from "./yomi/runtime-trace";

type Product = {
  readonly id: string;
  readonly name: string;
};

const initialProducts: readonly Product[] = [
  { id: "paper", name: "Paper" },
  { id: "pencil", name: "Pencil" },
];

const archiveActionTrace: YomiTraceMetadata = {
  name: "archive product optimistic swr",
  source: {
    file: "src/App.tsx",
    line: 91,
    symbol: "onClick",
  },
  graphNodeId: "product-swroptimistic-panel-on-click-1-action",
  correlationId: "swr-optimistic-inconsistency",
};

const cacheSource = {
  file: "src/App.tsx",
  line: 64,
  symbol: "mutateProducts",
} as const;

const productListSource = {
  file: "src/App.tsx",
  line: 41,
  symbol: "ProductSWROptimisticPanel",
} as const;

export function ProductSWROptimisticPanel() {
  const { data: products = initialProducts, mutate: mutateProducts } = useSWR(
    "/api/products",
    async () => initialProducts,
    {
      revalidateOnFocus: false,
      revalidateOnMount: false,
    },
  );
  const productNames = useMemo(
    () => products.map((product) => product.name).join(", "),
    [products],
  );

  function archivePaper() {
    recordRuntimeTrace({
      name: "archive product optimistic swr cache",
      kind: "state-committed",
      summary: "archive product optimistic swr cache mutate [/api/products].",
      source: cacheSource,
      graphNodeId: "product-swroptimistic-panel-mutate-1-cache",
      correlationId: "swr-optimistic-inconsistency",
    });
    void mutateProducts(
      async () => {
        throw new Error("archive failed");
      },
      {
        optimisticData: products.filter((product) => product.id !== "paper"),
        rollbackOnError: false,
        revalidate: false,
      },
    ).catch(() => undefined);
  }

  useYomiRenderTrace(
    {
      name: "product swr optimistic panel",
      source: productListSource,
      graphNodeId: "product-swroptimistic-panel",
      correlationId: "swr-optimistic-inconsistency",
    },
    () => `Visible products rendered as "${productNames}".`,
    [productNames],
  );

  return (
    <main>
      <h1>Products</h1>
      <output data-testid="product-list">{productNames}</output>
      <button data-testid="archive-paper-optimistic" onClick={createYomiAction(archiveActionTrace, archivePaper)}>
        Archive Paper Optimistic
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <SWRConfig value={{ fallback: { "/api/products": initialProducts }, provider: () => new Map() }}>
    <ProductSWROptimisticPanel />
  </SWRConfig>,
);
