import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { extractProjectGraph } from "../src/extractor";
import { instrumentProject } from "../src/instrument";

describe("instrumentProject", () => {
  test("proposes useYomiTraceEffect instrumentation for a source-linked effect", async () => {
    const projectPath = await createFixtureProject();
    const graph = extractProjectGraph({ projectPath });

    const result = await instrumentProject({
      adapterImport: "../yomi/react",
      graph,
      projectPath,
      target: "customer-search-panel-query-effect",
    });

    expect(result.applied).toBe(false);
    expect(result.changedFiles).toEqual([]);
    expect(result.targets).toEqual(["customer-search-panel-query-effect"]);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({
      adapterImport: "../yomi/react",
      file: "src/CustomerSearchPanel.tsx",
      graphNodeId: "customer-search-panel-query-effect",
      kind: "useYomiTraceEffect",
      metadataName: "customerSearchPanelQueryEffectTrace",
    });
    expect(result.proposals[0]?.patch.after).toContain(
      'import { useYomiTraceEffect, type YomiTraceMetadata } from "../yomi/react";',
    );
    expect(result.proposals[0]?.patch.after).toContain(
      "const customerSearchPanelQueryEffectTrace: YomiTraceMetadata =",
    );
    expect(result.proposals[0]?.patch.after).toContain(
      "useYomiTraceEffect(customerSearchPanelQueryEffectTrace, () => {",
    );

    const source = await readFile(join(projectPath, "src/CustomerSearchPanel.tsx"), "utf8");
    expect(source).toContain("useEffect(() => {");
  });

  test("applies useYomiTraceEffect instrumentation to the source file", async () => {
    const projectPath = await createFixtureProject();
    const graph = extractProjectGraph({ projectPath });

    const result = await instrumentProject({
      adapterImport: "../yomi/react",
      apply: true,
      graph,
      projectPath,
      target: "customer-search-panel-query-effect",
    });

    expect(result.applied).toBe(true);
    expect(result.changedFiles).toEqual(["src/CustomerSearchPanel.tsx"]);

    const source = await readFile(join(projectPath, "src/CustomerSearchPanel.tsx"), "utf8");
    expect(source).toContain(
      'import { useYomiTraceEffect, type YomiTraceMetadata } from "../yomi/react";',
    );
    expect(source).not.toContain('import { useEffect');
    expect(source).toContain("useYomiTraceEffect(customerSearchPanelQueryEffectTrace");
    expect(source).toContain('graphNodeId: "customer-search-panel-query-effect"');
  });

  test("applies useYomiTracedState instrumentation to a useState declaration", async () => {
    const projectPath = await createFixtureProject();
    const graph = extractProjectGraph({ projectPath });

    const result = await instrumentProject({
      adapterImport: "../yomi/react",
      apply: true,
      graph,
      projectPath,
      target: "customer-search-panel-query-state",
    });

    expect(result.applied).toBe(true);
    expect(result.proposals[0]).toMatchObject({
      graphNodeId: "customer-search-panel-query-state",
      kind: "useYomiTracedState",
      metadataName: "customerSearchPanelQueryStateTrace",
    });

    const source = await readFile(join(projectPath, "src/CustomerSearchPanel.tsx"), "utf8");
    expect(source).toContain(
      'import { useYomiTracedState, type YomiTraceMetadata } from "../yomi/react";',
    );
    expect(source).toContain(
      'const [query, setQuery] = useYomiTracedState(customerSearchPanelQueryStateTrace, "");',
    );
    expect(source).toContain('graphNodeId: "customer-search-panel-query-state"');
    expect(source).toContain("useState<Customer | null>(null)");
  });

  test("applies createYomiAction instrumentation to a JSX event handler", async () => {
    const projectPath = await createFixtureProject();
    const graph = extractProjectGraph({ projectPath });

    const result = await instrumentProject({
      adapterImport: "../yomi/react",
      apply: true,
      graph,
      projectPath,
      target: "customer-search-panel-on-change-1-action",
    });

    expect(result.applied).toBe(true);
    expect(result.proposals[0]).toMatchObject({
      graphNodeId: "customer-search-panel-on-change-1-action",
      kind: "createYomiAction",
      metadataName: "customerSearchPanelOnChange1ActionTrace",
    });

    const source = await readFile(join(projectPath, "src/CustomerSearchPanel.tsx"), "utf8");
    expect(source).toContain(
      'import { createYomiAction, type YomiTraceMetadata } from "../yomi/react";',
    );
    expect(source).toContain(
      "onChange={createYomiAction(customerSearchPanelOnChange1ActionTrace, (event) => setQuery(event.target.value))}",
    );
    expect(source).toContain('graphNodeId: "customer-search-panel-on-change-1-action"');
  });

  test("applies useYomiRenderTrace instrumentation to a component render owner", async () => {
    const projectPath = await createFixtureProject();
    const graph = extractProjectGraph({ projectPath });

    const result = await instrumentProject({
      adapterImport: "../yomi/react",
      apply: true,
      graph,
      projectPath,
      target: "customer-search-panel",
    });

    expect(result.applied).toBe(true);
    expect(result.proposals[0]).toMatchObject({
      graphNodeId: "customer-search-panel",
      kind: "useYomiRenderTrace",
      metadataName: "customerSearchPanelRenderTrace",
    });

    const source = await readFile(join(projectPath, "src/CustomerSearchPanel.tsx"), "utf8");
    expect(source).toContain(
      'import { useYomiRenderTrace, type YomiTraceMetadata } from "../yomi/react";',
    );
    expect(source).toContain(
      "const customerSearchPanelRenderTrace: YomiTraceMetadata =",
    );
    expect(source).toContain('graphNodeId: "customer-search-panel"');
    expect(source).toContain(
      'useYomiRenderTrace(customerSearchPanelRenderTrace, () => "CustomerSearchPanel render committed.");',
    );
  });

  test("applies useYomiRenderTrace instrumentation to an expression-bodied arrow component", async () => {
    const projectPath = await createFixtureProject();
    const graph = extractProjectGraph({ projectPath });

    const result = await instrumentProject({
      adapterImport: "../yomi/react",
      apply: true,
      graph,
      projectPath,
      target: "customer-summary",
    });

    expect(result.applied).toBe(true);
    expect(result.proposals[0]).toMatchObject({
      graphNodeId: "customer-summary",
      kind: "useYomiRenderTrace",
      metadataName: "customerSummaryRenderTrace",
    });

    const source = await readFile(join(projectPath, "src/CustomerSearchPanel.tsx"), "utf8");
    expect(source).toContain(
      'import { useYomiRenderTrace, type YomiTraceMetadata } from "../yomi/react";',
    );
    expect(source).toContain("const customerSummaryRenderTrace: YomiTraceMetadata =");
    expect(source).toContain("export const CustomerSummary = () => {");
    expect(source).toContain(
      'useYomiRenderTrace(customerSummaryRenderTrace, () => "CustomerSummary render committed.");',
    );
    expect(source).toContain('return <aside aria-label="Customer summary">Summary</aside>;');
  });

  test("applies TanStack Query cache operation instrumentation to invalidateQueries", async () => {
    const projectPath = await createFixtureProject();
    const graph = extractProjectGraph({ projectPath });
    const cacheOperation = graph.cacheOperations.find(
      (operation) => operation.kind === "invalidate",
    );

    const result = await instrumentProject({
      apply: true,
      graph,
      projectPath,
      queryAdapterImport: "../yomi/tanstack-query",
      target: cacheOperation?.id,
    });

    expect(cacheOperation?.id).toBe("customer-search-panel-invalidate-1-cache");
    expect(result.applied).toBe(true);
    expect(result.proposals[0]).toMatchObject({
      adapterImport: "../yomi/tanstack-query",
      graphNodeId: "customer-search-panel-invalidate-1-cache",
      kind: "traceTanStackQueryOperation",
      metadataName: "customerSearchPanelInvalidate1CacheTrace",
    });

    const source = await readFile(join(projectPath, "src/CustomerSearchPanel.tsx"), "utf8");
    expect(source).toContain(
      'import { traceTanStackQueryOperation, type YomiQueryTraceMetadata } from "../yomi/tanstack-query";',
    );
    expect(source).toContain(
      "const customerSearchPanelInvalidate1CacheTrace: YomiQueryTraceMetadata =",
    );
    expect(source).toContain(
      "traceTanStackQueryOperation({\n      metadata: customerSearchPanelInvalidate1CacheTrace,\n      operation: \"invalidate\",\n      queryKey: [\"customers\"],\n    });\n    queryClient.invalidateQueries({ queryKey: [\"customers\"] });",
    );
  });

  test("applies TanStack Query cache operation instrumentation before awaited invalidation", async () => {
    const projectPath = await createFixtureProject();
    const graph = extractProjectGraph({ projectPath });

    const result = await instrumentProject({
      apply: true,
      graph,
      projectPath,
      queryAdapterImport: "../yomi/tanstack-query",
      target: "customer-search-panel-invalidate-2-cache",
    });

    expect(result.applied).toBe(true);
    expect(result.proposals[0]).toMatchObject({
      graphNodeId: "customer-search-panel-invalidate-2-cache",
      kind: "traceTanStackQueryOperation",
      metadataName: "customerSearchPanelInvalidate2CacheTrace",
    });

    const source = await readFile(join(projectPath, "src/CustomerSearchPanel.tsx"), "utf8");
    expect(source).toContain(
      "traceTanStackQueryOperation({\n      metadata: customerSearchPanelInvalidate2CacheTrace,\n      operation: \"invalidate\",\n      queryKey: [\"customers\", \"awaited\"],\n    });\n    await queryClient.invalidateQueries({ queryKey: [\"customers\", \"awaited\"] });",
    );
  });

  test("applies TanStack Query cache operation instrumentation before returned invalidation", async () => {
    const projectPath = await createFixtureProject();
    const graph = extractProjectGraph({ projectPath });

    const result = await instrumentProject({
      apply: true,
      graph,
      projectPath,
      queryAdapterImport: "../yomi/tanstack-query",
      target: "customer-search-panel-invalidate-3-cache",
    });

    expect(result.applied).toBe(true);
    expect(result.proposals[0]).toMatchObject({
      graphNodeId: "customer-search-panel-invalidate-3-cache",
      kind: "traceTanStackQueryOperation",
      metadataName: "customerSearchPanelInvalidate3CacheTrace",
    });

    const source = await readFile(join(projectPath, "src/CustomerSearchPanel.tsx"), "utf8");
    expect(source).toContain(
      "traceTanStackQueryOperation({\n      metadata: customerSearchPanelInvalidate3CacheTrace,\n      operation: \"invalidate\",\n      queryKey: [\"customers\", \"returned\"],\n    });\n    return queryClient.invalidateQueries({ queryKey: [\"customers\", \"returned\"] });",
    );
  });

  test("applies Redux action usage instrumentation to a dispatch call", async () => {
    const projectPath = await createReduxFixtureProject();
    const graph = extractProjectGraph({ projectPath });
    const reduxActionUsage = graph.reduxActionUsages.find(
      (usage) => usage.actionName === "setAvailability",
    );

    const result = await instrumentProject({
      adapterImport: "../yomi/react",
      apply: true,
      graph,
      projectPath,
      target: reduxActionUsage?.id,
    });

    expect(reduxActionUsage?.id).toBe(
      "inventory-filter-panel-dispatches-set-availability-1-redux-action",
    );
    expect(result.applied).toBe(true);
    expect(result.proposals[0]).toMatchObject({
      graphNodeId: "inventory-filter-panel-dispatches-set-availability-1-redux-action",
      kind: "traceYomiReduxAction",
      metadataName: "inventoryFilterPanelDispatchesSetAvailability1ReduxActionTrace",
    });

    const source = await readFile(
      join(projectPath, "src/features/inventory/InventoryFilterPanel.tsx"),
      "utf8",
    );
    expect(source).toContain(
      'import { traceYomiReduxAction, type YomiTraceMetadata } from "../yomi/react";',
    );
    expect(source).toContain(
      "const inventoryFilterPanelDispatchesSetAvailability1ReduxActionTrace: YomiTraceMetadata =",
    );
    expect(source).toContain(
      'graphNodeId: "inventory-filter-panel-dispatches-set-availability-1-redux-action"',
    );
    expect(source).toContain(
      'onClick={() => traceYomiReduxAction(inventoryFilterPanelDispatchesSetAvailability1ReduxActionTrace, () => dispatch(setAvailability("in-stock")))}',
    );
  });

  test("applies Redux selector usage instrumentation after the selector hook", async () => {
    const projectPath = await createReduxFixtureProject();
    const graph = extractProjectGraph({ projectPath });
    const reduxSelectorUsage = graph.reduxSelectorUsages.find(
      (usage) => usage.selectedPath.join(".") === "inventoryFilter.availability",
    );

    const result = await instrumentProject({
      adapterImport: "../yomi/react",
      apply: true,
      graph,
      projectPath,
      target: reduxSelectorUsage?.id,
    });

    expect(reduxSelectorUsage?.id).toBe(
      "inventory-filter-panel-selects-inventory-filter-availability-1-redux-selector",
    );
    expect(result.applied).toBe(true);
    expect(result.proposals[0]).toMatchObject({
      graphNodeId: "inventory-filter-panel-selects-inventory-filter-availability-1-redux-selector",
      kind: "useYomiReduxSelectorTrace",
      metadataName: "inventoryFilterPanelSelectsInventoryFilterAvailability1ReduxSelectorTrace",
    });

    const source = await readFile(
      join(projectPath, "src/features/inventory/InventoryFilterPanel.tsx"),
      "utf8",
    );
    expect(source).toContain(
      'import { useYomiReduxSelectorTrace, type YomiTraceMetadata } from "../yomi/react";',
    );
    expect(source).toContain(
      "const availability = useAppSelector(selectInventoryAvailability);\n  useYomiReduxSelectorTrace(inventoryFilterPanelSelectsInventoryFilterAvailability1ReduxSelectorTrace, [\"inventoryFilter\", \"availability\"]);",
    );
    expect(source).toContain(
      'graphNodeId: "inventory-filter-panel-selects-inventory-filter-availability-1-redux-selector"',
    );
  });

  test("applies external store usage instrumentation after the store hook", async () => {
    const projectPath = await createExternalStoreFixtureProject();
    const graph = extractProjectGraph({ projectPath });
    const externalStoreUsage = graph.externalStoreUsages.find((usage) =>
      usage.selectedFields.includes("setSortMode"),
    );

    const result = await instrumentProject({
      adapterImport: "../yomi/react",
      apply: true,
      graph,
      projectPath,
      target: externalStoreUsage?.id,
    });

    expect(externalStoreUsage?.id).toBe(
      "inventory-sort-panel-uses-use-inventory-view-store-2-external-store",
    );
    expect(result.applied).toBe(true);
    expect(result.proposals[0]).toMatchObject({
      graphNodeId: "inventory-sort-panel-uses-use-inventory-view-store-2-external-store",
      kind: "useYomiExternalStoreTrace",
      metadataName: "inventorySortPanelUsesUseInventoryViewStore2ExternalStoreTrace",
    });

    const source = await readFile(
      join(projectPath, "src/features/inventory/InventorySortPanel.tsx"),
      "utf8",
    );
    expect(source).toContain(
      'import { useYomiExternalStoreTrace, type YomiTraceMetadata } from "../yomi/react";',
    );
    expect(source).toContain(
      "const setSortMode = useInventoryViewStore((state) => state.setSortMode);\n  useYomiExternalStoreTrace(inventorySortPanelUsesUseInventoryViewStore2ExternalStoreTrace, \"useInventoryViewStore\", [\"setSortMode\"], \"write\");",
    );
    expect(source).toContain(
      'graphNodeId: "inventory-sort-panel-uses-use-inventory-view-store-2-external-store"',
    );
  });

  test("applies Jotai atom instrumentation as an external store write trace", async () => {
    const projectPath = await createJotaiExternalStoreFixtureProject();
    const graph = extractProjectGraph({ projectPath });
    const externalStoreUsage = graph.externalStoreUsages.find((usage) =>
      usage.selectedFields.includes("updateSortMode"),
    );

    const result = await instrumentProject({
      adapterImport: "../yomi/react",
      apply: true,
      graph,
      projectPath,
      target: externalStoreUsage?.id,
    });

    expect(externalStoreUsage).toMatchObject({
      id: "inventory-jotai-sort-panel-uses-inventory-sort-atom-2-external-store",
      hookName: "useSetAtom",
      usageKind: "write",
    });
    expect(result.applied).toBe(true);
    expect(result.proposals[0]).toMatchObject({
      graphNodeId: "inventory-jotai-sort-panel-uses-inventory-sort-atom-2-external-store",
      kind: "useYomiExternalStoreTrace",
      metadataName: "inventoryJotaiSortPanelUsesInventorySortAtom2ExternalStoreTrace",
    });

    const source = await readFile(
      join(projectPath, "src/features/inventory/InventoryJotaiSortPanel.tsx"),
      "utf8",
    );
    expect(source).toContain(
      'import { useYomiExternalStoreTrace, type YomiTraceMetadata } from "../yomi/react";',
    );
    expect(source).toContain(
      "const updateSortMode = useSetAtom(inventorySortAtom);\n  useYomiExternalStoreTrace(inventoryJotaiSortPanelUsesInventorySortAtom2ExternalStoreTrace, \"inventorySortAtom\", [\"updateSortMode\"], \"write\");",
    );
    expect(source).toContain(
      'graphNodeId: "inventory-jotai-sort-panel-uses-inventory-sort-atom-2-external-store"',
    );
  });

  test("applies router refresh instrumentation to a refresh call", async () => {
    const projectPath = await createRouterRefreshFixtureProject();
    const graph = extractProjectGraph({ projectPath });

    const result = await instrumentProject({
      adapterImport: "../yomi/react",
      apply: true,
      graph,
      projectPath,
      target: "invoice-client-router-refresh",
    });

    expect(result.applied).toBe(true);
    expect(result.proposals[0]).toMatchObject({
      graphNodeId: "invoice-client-router-refresh",
      kind: "traceYomiRouterRefresh",
      metadataName: "invoiceClientRouterRefreshTrace",
    });

    const source = await readFile(
      join(projectPath, "src/features/invoices/InvoiceClient.tsx"),
      "utf8",
    );
    expect(source.startsWith('"use client";\n\n')).toBe(true);
    expect(source).toContain(
      'import { traceYomiRouterRefresh, type YomiTraceMetadata } from "../yomi/react";',
    );
    expect(source).toContain('graphNodeId: "invoice-client-router-refresh"');
    expect(source).toContain(
      "traceYomiRouterRefresh(invoiceClientRouterRefreshTrace, () => router.refresh());",
    );
  });

  test("applies form field instrumentation to the owning component", async () => {
    const projectPath = await createFormFieldFixtureProject();
    const graph = extractProjectGraph({ projectPath });

    const result = await instrumentProject({
      adapterImport: "../yomi/react",
      apply: true,
      graph,
      projectPath,
      target: "support-validation-form-support-email-form-field",
    });

    expect(result.applied).toBe(true);
    expect(result.proposals[0]).toMatchObject({
      graphNodeId: "support-validation-form-support-email-form-field",
      kind: "useYomiFormFieldTrace",
      metadataName: "supportValidationFormSupportEmailFormFieldTrace",
    });

    const source = await readFile(
      join(projectPath, "src/features/billing/SupportValidationForm.tsx"),
      "utf8",
    );
    expect(source).toContain(
      'import { useYomiFormFieldTrace, type YomiTraceMetadata } from "../yomi/react";',
    );
    expect(source).toContain(
      'graphNodeId: "support-validation-form-support-email-form-field"',
    );
    expect(source).toContain(
      'useYomiFormFieldTrace(supportValidationFormSupportEmailFormFieldTrace, "supportEmail", "validation");',
    );
    expect(source).toContain('symbol: "required"');
  });

  test("applies multiple instrumentation targets from one source snapshot", async () => {
    const projectPath = await createFixtureProject();
    const graph = extractProjectGraph({ projectPath });

    const result = await instrumentProject({
      adapterImport: "../yomi/react",
      apply: true,
      graph,
      projectPath,
      targets: [
        "customer-search-panel-on-change-1-action",
        "customer-search-panel-query-state",
        "customer-search-panel-query-effect",
        "customer-search-panel",
      ],
    });

    expect(result.applied).toBe(true);
    expect(result.changedFiles).toEqual(["src/CustomerSearchPanel.tsx"]);
    expect(result.targets).toEqual([
      "customer-search-panel-on-change-1-action",
      "customer-search-panel-query-state",
      "customer-search-panel-query-effect",
      "customer-search-panel",
    ]);
    expect(result.proposals.map((proposal) => proposal.kind)).toEqual([
      "createYomiAction",
      "useYomiTracedState",
      "useYomiTraceEffect",
      "useYomiRenderTrace",
    ]);

    const [firstProposal, secondProposal, thirdProposal, fourthProposal] = result.proposals;
    expect(firstProposal?.patch.before).toEqual(secondProposal?.patch.before);
    expect(secondProposal?.patch.before).toEqual(thirdProposal?.patch.before);
    expect(thirdProposal?.patch.before).toEqual(fourthProposal?.patch.before);
    expect(firstProposal?.patch.after).toEqual(secondProposal?.patch.after);
    expect(secondProposal?.patch.after).toEqual(thirdProposal?.patch.after);
    expect(thirdProposal?.patch.after).toEqual(fourthProposal?.patch.after);

    const source = await readFile(join(projectPath, "src/CustomerSearchPanel.tsx"), "utf8");
    expect(source).toContain('from "../yomi/react";');
    expect(source).toContain("createYomiAction");
    expect(source).toContain("useYomiTracedState");
    expect(source).toContain("useYomiTraceEffect");
    expect(source).toContain("useYomiRenderTrace");
    expect(source).toContain("type YomiTraceMetadata");
    expect(source).toContain(
      'useYomiRenderTrace(customerSearchPanelRenderTrace, () => "CustomerSearchPanel render committed.");',
    );
    expect(source).toContain(
      'const [query, setQuery] = useYomiTracedState(customerSearchPanelQueryStateTrace, "");',
    );
    expect(source).toContain(
      "useYomiTraceEffect(customerSearchPanelQueryEffectTrace, () => {",
    );
    expect(source).toContain(
      "onChange={createYomiAction(customerSearchPanelOnChange1ActionTrace, (event) => setQuery(event.target.value))}",
    );
  });
});

async function createFixtureProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "yomi-instrument-"));
  await writeFile(
    join(projectPath, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          jsx: "react-jsx",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          target: "ES2022",
        },
        include: ["src"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await mkdir(join(projectPath, "src"), { recursive: true });
  await writeFile(
    join(projectPath, "src/CustomerSearchPanel.tsx"),
    `import { useEffect, useState } from "react";

type Customer = { name: string };

export function CustomerSearchPanel() {
  const [query, setQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const queryClient = {
    invalidateQueries: (_input: { readonly queryKey: readonly string[] }) => undefined,
  };

  useEffect(() => {
    fetch("/api/customers?q=" + query)
      .then((response) => response.json())
      .then((customer: Customer) => setSelectedCustomer(customer));
  }, [query]);

  function clearCustomerCache() {
    queryClient.invalidateQueries({ queryKey: ["customers"] });
  }

  async function refreshCustomerCache() {
    await queryClient.invalidateQueries({ queryKey: ["customers", "awaited"] });
  }

  function returnCustomerCacheInvalidation() {
    return queryClient.invalidateQueries({ queryKey: ["customers", "returned"] });
  }

  return (
    <section>
      <input
        aria-label="Customer search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <button onClick={clearCustomerCache}>Clear cache</button>
      <div role="status">{selectedCustomer?.name}</div>
    </section>
  );
}

export const CustomerSummary = () => <aside aria-label="Customer summary">Summary</aside>;
`,
    "utf8",
  );

  return projectPath;
}

async function createReduxFixtureProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "yomi-redux-instrument-"));
  await writeFile(
    join(projectPath, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          jsx: "react-jsx",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          target: "ES2022",
        },
        include: ["src"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await mkdir(join(projectPath, "src/features/inventory"), { recursive: true });
  await writeFile(
    join(projectPath, "src/features/inventory/inventoryFilterSlice.ts"),
    `import { configureStore, createSelector, createSlice } from "@reduxjs/toolkit";

type InventoryFilterState = {
  readonly availability: "all" | "in-stock";
};

const initialState: InventoryFilterState = {
  availability: "all",
};

export const inventoryFilterSlice = createSlice({
  name: "inventoryFilter",
  initialState,
  reducers: {
    setAvailability(state, action: { readonly payload: InventoryFilterState["availability"] }) {
      state.availability = action.payload;
    },
  },
});

export const inventoryStore = configureStore({
  reducer: {
    inventoryFilter: inventoryFilterSlice.reducer,
  },
});

const selectInventoryFilterState = (state: { inventoryFilter: InventoryFilterState }) =>
  state.inventoryFilter;

export const selectInventoryAvailability = createSelector(
  [selectInventoryFilterState],
  (inventoryFilter) => inventoryFilter.availability,
);

export const { setAvailability } = inventoryFilterSlice.actions;
`,
    "utf8",
  );
  await writeFile(
    join(projectPath, "src/features/inventory/InventoryFilterPanel.tsx"),
    `import { selectInventoryAvailability, setAvailability } from "./inventoryFilterSlice";

function useAppSelector<T>(selector: (state: { inventoryFilter: { availability: string } }) => T) {
  return selector({ inventoryFilter: { availability: "all" } });
}

function useAppDispatch() {
  return (action: unknown) => action;
}

export function InventoryFilterPanel() {
  const dispatch = useAppDispatch();
  const availability = useAppSelector(selectInventoryAvailability);

  return (
    <button type="button" aria-label="Show in-stock inventory" onClick={() => dispatch(setAvailability("in-stock"))}>
      Show in-stock {availability}
    </button>
  );
}
`,
    "utf8",
  );

  return projectPath;
}

async function createExternalStoreFixtureProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "yomi-external-store-instrument-"));
  await writeFile(
    join(projectPath, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          jsx: "react-jsx",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          target: "ES2022",
        },
        include: ["src"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await mkdir(join(projectPath, "src/features/inventory"), { recursive: true });
  await writeFile(
    join(projectPath, "src/features/inventory/inventoryViewStore.ts"),
    `import { create } from "zustand";

type InventoryViewState = {
  readonly sortMode: string;
  readonly setSortMode: (sortMode: string) => void;
};

export const useInventoryViewStore = create<InventoryViewState>((set) => ({
  sortMode: "createdAt",
  setSortMode: (sortMode) => set({ sortMode }),
}));
`,
    "utf8",
  );
  await writeFile(
    join(projectPath, "src/features/inventory/InventorySortPanel.tsx"),
    `import { useInventoryViewStore } from "./inventoryViewStore";

export function InventorySortPanel() {
  const sortMode = useInventoryViewStore((state) => state.sortMode);
  const setSortMode = useInventoryViewStore((state) => state.setSortMode);

  return (
    <button type="button" aria-label="Sort by name" onClick={() => setSortMode("name")}>
      Sort by name {sortMode}
    </button>
  );
}
`,
    "utf8",
  );

  return projectPath;
}

async function createJotaiExternalStoreFixtureProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "yomi-jotai-instrument-"));
  await writeFile(
    join(projectPath, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          jsx: "react-jsx",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          target: "ES2022",
        },
        include: ["src"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await mkdir(join(projectPath, "src/features/inventory"), { recursive: true });
  await writeFile(
    join(projectPath, "src/features/inventory/inventorySortAtom.ts"),
    `import { atom } from "jotai";

export const inventorySortAtom = atom("createdAt");
`,
    "utf8",
  );
  await writeFile(
    join(projectPath, "src/features/inventory/InventoryJotaiSortPanel.tsx"),
    `import { useAtomValue, useSetAtom } from "jotai";

import { inventorySortAtom } from "./inventorySortAtom";

export function InventoryJotaiSortPanel() {
  const sortMode = useAtomValue(inventorySortAtom);
  const updateSortMode = useSetAtom(inventorySortAtom);

  return (
    <button type="button" aria-label="Sort by priority" onClick={() => updateSortMode("priority")}>
      Sort by priority {sortMode}
    </button>
  );
}
`,
    "utf8",
  );

  return projectPath;
}

async function createRouterRefreshFixtureProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "yomi-router-refresh-instrument-"));
  await writeFile(
    join(projectPath, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          jsx: "react-jsx",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          target: "ES2022",
        },
        include: ["src"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await mkdir(join(projectPath, "src/features/invoices"), { recursive: true });
  await writeFile(
    join(projectPath, "src/features/invoices/actions.ts"),
    `"use server";

export async function saveInvoice(_formData: FormData) {
  return { ok: true };
}
`,
    "utf8",
  );
  await writeFile(
    join(projectPath, "src/features/invoices/InvoiceClient.tsx"),
    `"use client";

import { useRouter } from "next/navigation";
import { saveInvoice } from "./actions";

export function InvoiceClient() {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label="Sync invoice"
      onClick={async () => {
        await saveInvoice(new FormData());
        router.refresh();
      }}
    >
      Sync invoice
    </button>
  );
}
`,
    "utf8",
  );

  return projectPath;
}

async function createFormFieldFixtureProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "yomi-form-field-instrument-"));
  await writeFile(
    join(projectPath, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          jsx: "react-jsx",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          target: "ES2022",
        },
        include: ["src"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await mkdir(join(projectPath, "src/features/billing"), { recursive: true });
  await writeFile(
    join(projectPath, "src/features/billing/SupportValidationForm.tsx"),
    `import { useForm } from "react-hook-form";

type SupportFormValues = {
  readonly supportEmail: string;
};

export function SupportValidationForm() {
  const {
    formState: { errors },
    register,
    setError,
  } = useForm<SupportFormValues>();

  function flagSupportEmail() {
    setError("supportEmail", {
      type: "manual",
      message: "Support email is invalid.",
    });
  }

  return (
    <form aria-label="Support contact">
      <input
        aria-label="Support email"
        {...register("supportEmail", {
          required: "Support email is required.",
          pattern: /@example\\.com$/,
        })}
      />
      {errors.supportEmail ? <p role="alert">{errors.supportEmail.message}</p> : null}
      <button type="button" onClick={flagSupportEmail}>
        Flag email
      </button>
    </form>
  );
}
`,
    "utf8",
  );

  return projectPath;
}
