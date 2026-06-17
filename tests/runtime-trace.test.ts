import { describe, expect, test } from "bun:test";

import {
  createYomiAction,
  formatYomiExternalStoreTraceSummary,
  traceYomiRouterRefresh,
  traceYomiReduxAction,
} from "../src/react-instrumentation";
import { ensureYomiRuntimeTrace } from "../src/runtime-trace";

describe("runtime trace instrumentation", () => {
  test("createYomiAction records source-linked action events", () => {
    const runtimeTrace = ensureYomiRuntimeTrace();
    runtimeTrace.clear();
    let value = "broken";
    const action = createYomiAction<[string]>(
      {
        name: "toggle scenario",
        source: {
          file: "src/features/customers/CustomerSearchPanel.tsx",
          line: 73,
          symbol: "SearchInput",
        },
        graphNodeId: "edit-query-action",
        correlationId: "customer-search-demo",
      },
      (nextValue) => {
        value = nextValue;
      },
    );

    action("fixed");

    expect(value).toBe("fixed");
    expect(runtimeTrace.getTrace()).toEqual([
      {
        id: "runtime-1",
        at: expect.stringMatching(/^runtime:/),
        kind: "action-requested",
        summary: "toggle scenario action requested.",
        source: {
          file: "src/features/customers/CustomerSearchPanel.tsx",
          line: 73,
          symbol: "SearchInput",
        },
        graphNodeId: "edit-query-action",
        correlationId: "customer-search-demo",
      },
    ]);
  });

  test("Redux action trace helper records source-linked dispatch events", () => {
    const runtimeTrace = ensureYomiRuntimeTrace();
    runtimeTrace.clear();

    const actionResult = traceYomiReduxAction(
      {
        name: "setAvailability",
        source: {
          file: "src/features/inventory/InventoryFilterPanel.tsx",
          line: 21,
          symbol: "dispatch",
        },
        graphNodeId: "inventory-filter-panel-dispatches-set-availability-1-redux-action",
      },
      () => ({ type: "inventoryFilter/setAvailability" }),
    );

    expect(actionResult).toEqual({ type: "inventoryFilter/setAvailability" });
    expect(runtimeTrace.getTrace()).toEqual([
      expect.objectContaining({
        id: "runtime-1",
        kind: "action-requested",
        summary: "setAvailability Redux action dispatched.",
        graphNodeId: "inventory-filter-panel-dispatches-set-availability-1-redux-action",
      }),
    ]);
  });

  test("router refresh trace helper records source-linked refresh events", () => {
    const runtimeTrace = ensureYomiRuntimeTrace();
    runtimeTrace.clear();
    let refreshed = false;

    traceYomiRouterRefresh(
      {
        name: "router refresh",
        source: {
          file: "src/features/invoices/InvoiceClient.tsx",
          line: 36,
          symbol: "refresh",
        },
        graphNodeId: "invoice-client-router-refresh",
      },
      () => {
        refreshed = true;
      },
    );

    expect(refreshed).toBe(true);
    expect(runtimeTrace.getTrace()).toEqual([
      expect.objectContaining({
        id: "runtime-1",
        kind: "action-requested",
        summary: "router refresh requested router.refresh().",
        graphNodeId: "invoice-client-router-refresh",
      }),
    ]);
  });

  test("external store trace summary records read and write usage", () => {
    expect(
      formatYomiExternalStoreTraceSummary({
        fieldNames: ["setSortMode"],
        metadataName: "inventorySortAtom",
        storeName: "inventorySortAtom",
        usageKind: "write",
      }),
    ).toBe("inventorySortAtom external store inventorySortAtom write setSortMode.");
    expect(
      formatYomiExternalStoreTraceSummary({
        fieldNames: ["sortMode", "setSortMode"],
        metadataName: "inventorySortAtom",
        storeName: "inventorySortAtom",
        usageKind: "read-write",
      }),
    ).toBe(
      "inventorySortAtom external store inventorySortAtom read/write sortMode, setSortMode.",
    );
  });
});
