import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import useSWR, { SWRConfig, useSWRConfig } from "swr";

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
  name: "archive product swr",
  source: {
    file: "src/App.tsx",
    line: 86,
    symbol: "onClick",
  },
  graphNodeId: "product-swrpanel-on-click-1-action",
  correlationId: "swr-cache-inconsistency",
};

const cacheSource = {
  file: "src/App.tsx",
  line: 65,
  symbol: "mutate",
} as const;

const productListSource = {
  file: "src/App.tsx",
  line: 41,
  symbol: "ProductSWRPanel",
} as const;

export function ProductSWRPanel() {
  const [serverProducts, setServerProducts] = useState<readonly Product[]>(initialProducts);
  const { mutate } = useSWRConfig();
  const products = useSWR("/api/products", async () => serverProducts, {
    revalidateOnFocus: false,
    revalidateOnMount: false,
  });
  const productNames = useMemo(
    () => (products.data ?? []).map((product) => product.name).join(", "),
    [products.data],
  );

  async function archivePaper() {
    setServerProducts((currentProducts) =>
      currentProducts.filter((product) => product.id !== "paper"),
    );
    recordRuntimeTrace({
      name: "archive product swr cache",
      kind: "state-committed",
      summary: "archive product swr cache mutate [/api/product].",
      source: cacheSource,
      graphNodeId: "product-swrpanel-mutate-1-cache",
      correlationId: "swr-cache-inconsistency",
    });
    await mutate("/api/product");
  }

  useYomiRenderTrace(
    {
      name: "product swr panel",
      source: productListSource,
      graphNodeId: "product-swrpanel",
      correlationId: "swr-cache-inconsistency",
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
      <button data-testid="archive-paper-swr" onClick={createYomiAction(archiveActionTrace, archivePaper)}>
        Archive Paper SWR
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <SWRConfig value={{ fallback: { "/api/products": initialProducts }, provider: () => new Map() }}>
    <ProductSWRPanel />
  </SWRConfig>,
);
