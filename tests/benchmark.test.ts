import { describe, expect, test } from "bun:test";

import { runReactRepairBenchmark } from "../src/benchmark";
import { listExamples, runBenchmark } from "../src/cli-support";

describe("React repair benchmark", () => {
  test("scores whether visible UI symptoms reach the expected edit targets", () => {
    const result = runReactRepairBenchmark({});

    expect(result.summary).toBe(
      "React repair benchmark: 25/25 must-pass case(s) passed; 1 known limit(s).",
    );
    expect(result.score).toEqual({
      failed: 0,
      knownLimits: 1,
      mustPass: 25,
      passed: 25,
      total: 26,
    });
    expect(result.cases.map((benchmarkCase) => benchmarkCase.status)).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "known-limit",
    ]);
    expect(result.cases.map((benchmarkCase) => benchmarkCase.actualEditTarget)).toEqual([
      {
        file: "src/features/orders/OrdersPanel.tsx",
        line: 26,
        symbol: "useEffect",
      },
      {
        file: "src/features/customers/CustomerEditor.tsx",
        line: 40,
        symbol: "setQueryData",
      },
      {
        file: "src/features/checkout/cartReducer.ts",
        line: 19,
        symbol: "cartReducer",
      },
      {
        file: "src/features/inventory/useInventorySearch.ts",
        line: 17,
        symbol: "useEffect",
      },
      {
        file: "src/features/inventory/inventoryViewStore.ts",
        line: 12,
        symbol: "setSortMode",
      },
      {
        file: "src/features/inventory/inventorySortAtom.ts",
        line: 3,
        symbol: "inventorySortAtom",
      },
      {
        file: "src/features/inventory/inventoryFilterSlice.ts",
        line: 15,
        symbol: "setAvailability",
      },
      {
        file: "src/features/viewport/ViewportTrackerPanel.tsx",
        line: 8,
        symbol: "useEffect",
      },
      {
        file: "src/features/theme/ThemeContext.tsx",
        line: 15,
        symbol: "previewClassName",
      },
      {
        file: "src/features/products/ProductArchivePanel.tsx",
        line: 30,
        symbol: "invalidateQueries",
      },
      {
        file: "src/features/products/ProductRestorePanel.tsx",
        line: 39,
        symbol: "invalidateQueries",
      },
      {
        file: "src/features/products/ProductSWRPanel.tsx",
        line: 27,
        symbol: "mutate",
      },
      {
        file: "src/features/products/ProductSWROptimisticPanel.tsx",
        line: 30,
        symbol: "mutateProducts",
      },
      {
        file: "src/features/reports/ReportRoute.tsx",
        line: 22,
        symbol: "setSearchParams",
      },
      {
        file: "src/features/projects/ProjectRoute.tsx",
        line: 14,
        symbol: "createProjectAction",
      },
      {
        file: "src/features/projects/ProjectRoute.tsx",
        line: 14,
        symbol: "createProjectAction",
      },
      {
        file: "src/features/projects/ProjectRoute.tsx",
        line: 14,
        symbol: "createProjectAction",
      },
      {
        file: "src/features/billing/BillingContactForm.tsx",
        line: 24,
        symbol: "register",
      },
      {
        file: "src/features/billing/SupportValidationForm.tsx",
        line: 32,
        symbol: "required",
      },
      {
        file: "src/features/billing/ShippingPreferenceForm.tsx",
        line: 44,
        symbol: "required",
      },
      {
        file: "src/features/billing/AccountSchemaForm.tsx",
        line: 6,
        symbol: "accountEmail",
      },
      {
        file: "src/features/invoices/actions.ts",
        line: 6,
        symbol: "saveInvoice",
      },
      {
        file: "src/features/invoices/actions.ts",
        line: 6,
        symbol: "saveInvoice",
      },
      {
        file: "src/features/invoices/actions.ts",
        line: 6,
        symbol: "saveInvoice",
      },
      {
        file: "src/features/reports/reportActions.ts",
        line: 1,
        symbol: "createReportRunner",
      },
      {
        file: "src/features/presets/DynamicPresetPanel.tsx",
        line: 16,
        symbol: "DynamicPresetPanel",
      },
    ]);
    expect(result.cases.map((benchmarkCase) => benchmarkCase.repairPlan.editTarget)).toEqual(
      result.cases.map((benchmarkCase) => benchmarkCase.actualEditTarget),
    );
    const mustPassCases = result.cases.filter(
      (benchmarkCase) => benchmarkCase.expectation === "must-pass",
    );
    expect(mustPassCases.flatMap((benchmarkCase) => benchmarkCase.repairPlanForbiddenMatches)).toEqual([]);
    expect(mustPassCases.flatMap((benchmarkCase) => benchmarkCase.missingRepairPlanFields)).toEqual([]);
    expect(
      mustPassCases.every((benchmarkCase) => benchmarkCase.repairPlan.confidence.level === "high"),
    ).toBe(true);
    expect(
      mustPassCases.every((benchmarkCase) =>
        benchmarkCase.repairPlan.evidenceTrail.some(
          (evidence) => evidence.role === "behavior-owner",
        )
      ),
    ).toBe(true);
    expect(
      mustPassCases.every((benchmarkCase) =>
        benchmarkCase.repairPlan.whyEditTarget.includes("source-linked behavior owner")
      ),
    ).toBe(true);
    expect(mustPassCases.every((benchmarkCase) => benchmarkCase.repairPlan.nextCommands.length > 0)).toBe(
      true,
    );
    expect(
      mustPassCases.every((benchmarkCase) => benchmarkCase.repairPlan.verificationPlan.length > 0),
    ).toBe(true);
    const handlerFactoryCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "handler-factory-returned-event-handler",
    );
    expect(handlerFactoryCase).toMatchObject({
      status: "passed",
      actualEditTarget: {
        file: "src/features/reports/reportActions.ts",
        line: 1,
        symbol: "createReportRunner",
      },
      forbiddenMatches: [],
      missingEvidenceLabels: [],
    });
    const dynamicPropKnownLimit = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "dynamic-returned-prop-object-handler",
    );
    expect(dynamicPropKnownLimit).toMatchObject({
      status: "known-limit",
      knownLimitReason:
        "Yomi does not yet resolve event handlers hidden inside dynamically returned JSX prop objects.",
      actualEditTarget: {
        file: "src/features/presets/DynamicPresetPanel.tsx",
        line: 16,
        symbol: "DynamicPresetPanel",
      },
      missingRepairPlanFields: ["confidence"],
    });
    const contextCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "context-provider-derived-value",
    );
    expect(contextCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "context: ThemeContext",
          source: {
            file: "src/features/theme/ThemeSettingsPanel.tsx",
            line: 5,
            symbol: "useTheme",
          },
        }),
        expect.objectContaining({
          label: "context: ThemeContext",
          source: {
            file: "src/features/theme/ThemePreview.tsx",
            line: 4,
            symbol: "useTheme",
          },
        }),
      ]),
    );
    const cleanupCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "missing-effect-cleanup",
    );
    expect(cleanupCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "effect cleanup risk: missing cleanup",
          detail: expect.stringContaining("Resources: addEventListener"),
          source: {
            file: "src/features/viewport/ViewportTrackerPanel.tsx",
            line: 8,
            symbol: "useEffect",
          },
        }),
        expect.objectContaining({
          label: "likely edit target",
          source: {
            file: "src/features/viewport/ViewportTrackerPanel.tsx",
            line: 8,
            symbol: "useEffect",
          },
        }),
      ]),
    );
    const externalStoreCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "external-store-action-ownership",
    );
    expect(externalStoreCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "external store: useInventoryViewStore",
          detail: expect.stringContaining("Selected sources: setSortMode@"),
          source: {
            file: "src/features/inventory/InventorySortPanel.tsx",
            line: 6,
            symbol: "useInventoryViewStore",
          },
        }),
        expect.objectContaining({
          label: "likely edit target",
          source: {
            file: "src/features/inventory/inventoryViewStore.ts",
            line: 12,
            symbol: "setSortMode",
          },
        }),
      ]),
    );
    const jotaiCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "jotai-atom-action-ownership",
    );
    expect(jotaiCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "external store: inventorySortAtom",
          detail: expect.stringContaining("Selected sources: inventorySortAtom@"),
          source: {
            file: "src/features/inventory/InventoryJotaiSortPanel.tsx",
            line: 8,
            symbol: "useSetAtom",
          },
        }),
        expect.objectContaining({
          label: "likely edit target",
          source: {
            file: "src/features/inventory/inventorySortAtom.ts",
            line: 3,
            symbol: "inventorySortAtom",
          },
        }),
      ]),
    );
    const reduxCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "redux-slice-action-ownership",
    );
    expect(reduxCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "redux action: setAvailability",
          detail: expect.stringContaining("Reducer: src/features/inventory/inventoryFilterSlice.ts:15"),
          source: {
            file: "src/features/inventory/InventoryFilterPanel.tsx",
            line: 21,
            symbol: "dispatch",
          },
        }),
        expect.objectContaining({
          label: "redux selector: inventoryFilter.availability",
          detail: expect.stringContaining("Selected source: src/features/inventory/inventoryFilterSlice.ts:8"),
          source: {
            file: "src/features/inventory/InventoryFilterPanel.tsx",
            line: 14,
            symbol: "useAppSelector",
          },
        }),
        expect.objectContaining({
          label: "likely edit target",
          source: {
            file: "src/features/inventory/inventoryFilterSlice.ts",
            line: 15,
            symbol: "setAvailability",
          },
        }),
      ]),
    );
    const mutationCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "mutation-onsuccess-cache-key",
    );
    expect(mutationCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "data path: mutation success: archiveMutation",
          detail: expect.stringContaining("cacheOperation:product-archive-panel-invalidate-1-cache"),
        }),
        expect.objectContaining({
          label: "data path: cache: invalidate [product]",
          detail: expect.stringContaining("trigger:mutation-success:archiveMutation"),
        }),
      ]),
    );
    const mutateCallCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "mutate-call-onsettled-cache-key",
    );
    expect(mutateCallCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "data path: mutation settled: restoreMutation",
          detail: expect.stringContaining("cacheOperation:product-restore-panel-invalidate-1-cache"),
        }),
        expect.objectContaining({
          label: "data path: cache: invalidate [archived-product]",
          detail: expect.stringContaining("trigger:mutation-settled:restoreMutation"),
        }),
      ]),
    );
    const swrCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "swr-global-mutate-cache-key",
    );
    expect(swrCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "data path: cache: mutate [/api/product]",
          source: {
            file: "src/features/products/ProductSWRPanel.tsx",
            line: 27,
            symbol: "mutate",
          },
        }),
      ]),
    );
    const swrOptimisticCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "swr-bound-mutate-optimistic-policy",
    );
    expect(swrOptimisticCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "data path: cache policy: optimistic update",
          detail: expect.stringContaining("rollbackOnError:false"),
          source: {
            file: "src/features/products/ProductSWROptimisticPanel.tsx",
            line: 31,
            symbol: "optimisticData",
          },
        }),
        expect.objectContaining({
          label: "data path: cache: mutate [/api/products]",
          detail: expect.stringContaining("policy:optimistic-update"),
          source: {
            file: "src/features/products/ProductSWROptimisticPanel.tsx",
            line: 30,
            symbol: "mutateProducts",
          },
        }),
      ]),
    );
    const formValidationCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "form-validation-error-ownership",
    );
    expect(formValidationCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "form validation: supportEmail",
          detail: expect.stringContaining("required:"),
          source: {
            file: "src/features/billing/SupportValidationForm.tsx",
            line: 32,
            symbol: "required",
          },
        }),
        expect.objectContaining({
          label: "form error read: supportEmail",
          source: {
            file: "src/features/billing/SupportValidationForm.tsx",
            line: 37,
            symbol: "supportEmail",
          },
        }),
        expect.objectContaining({
          label: "form error set: supportEmail",
          source: {
            file: "src/features/billing/SupportValidationForm.tsx",
            line: 19,
            symbol: "setError",
          },
        }),
      ]),
    );
    const routerActionCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "router-route-action-ownership",
    );
    expect(routerActionCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "effect/hook: route action",
          source: {
            file: "src/features/projects/ProjectRoute.tsx",
            line: 14,
            symbol: "createProjectAction",
          },
        }),
        expect.objectContaining({
          label: "likely edit target",
          source: {
            file: "src/features/projects/ProjectRoute.tsx",
            line: 14,
            symbol: "createProjectAction",
          },
        }),
      ]),
    );
    const routerUseSubmitCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "router-use-submit-action-ownership",
    );
    expect(routerUseSubmitCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "ui: Quick create project",
        }),
        expect.objectContaining({
          label: "effect/hook: route action",
          source: {
            file: "src/features/projects/ProjectRoute.tsx",
            line: 14,
            symbol: "createProjectAction",
          },
        }),
      ]),
    );
    const routerFetcherCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "router-fetcher-form-action-ownership",
    );
    expect(routerFetcherCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "ui: Archive project",
        }),
        expect.objectContaining({
          label: "effect/hook: route action",
          source: {
            file: "src/features/projects/ProjectRoute.tsx",
            line: 14,
            symbol: "createProjectAction",
          },
        }),
      ]),
    );
    const formControllerCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "form-controller-validation-ownership",
    );
    expect(formControllerCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "form field: shippingCountry",
          source: {
            file: "src/features/billing/ShippingPreferenceForm.tsx",
            line: 40,
            symbol: "Controller",
          },
        }),
        expect.objectContaining({
          label: "form validation: shippingCountry",
          detail: expect.stringContaining("required:"),
          source: {
            file: "src/features/billing/ShippingPreferenceForm.tsx",
            line: 44,
            symbol: "required",
          },
        }),
      ]),
    );
    const formResolverCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "form-resolver-schema-ownership",
    );
    expect(formResolverCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "form validation: accountEmail",
          detail: expect.stringContaining("validate:zodResolver:accountSchema.accountEmail"),
          source: {
            file: "src/features/billing/AccountSchemaForm.tsx",
            line: 6,
            symbol: "accountEmail",
          },
        }),
        expect.objectContaining({
          label: "form error read: accountEmail",
          source: {
            file: "src/features/billing/AccountSchemaForm.tsx",
            line: 33,
            symbol: "accountEmail",
          },
        }),
      ]),
    );
    const nextServerActionCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "next-form-server-action-ownership",
    );
    expect(nextServerActionCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "ui: Submit invoice",
        }),
        expect.objectContaining({
          label: "effect/hook: server action",
          source: {
            file: "src/features/invoices/actions.ts",
            line: 6,
            symbol: "saveInvoice",
          },
        }),
        expect.objectContaining({
          label: "next route: /invoices",
          source: {
            file: "src/app/invoices/page.tsx",
            line: 18,
            symbol: "InvoicePage",
          },
        }),
        expect.objectContaining({
          label: "rsc boundary: server to client",
          source: {
            file: "src/app/invoices/page.tsx",
            line: 33,
            symbol: "InvoiceClient",
          },
        }),
        expect.objectContaining({
          label: "rsc suspense: Loading invoice editor...",
          source: {
            file: "src/app/invoices/page.tsx",
            line: 32,
            symbol: "Suspense",
          },
        }),
        expect.objectContaining({
          label: "rsc boundary prop risk: exportBuilder",
          source: {
            file: "src/app/invoices/page.tsx",
            line: 34,
            symbol: "exportBuilder",
          },
        }),
        expect.objectContaining({
          label: "data path: cache: revalidate-path [/invoices]",
          source: {
            file: "src/features/invoices/actions.ts",
            line: 9,
            symbol: "revalidatePath",
          },
        }),
        expect.objectContaining({
          label: "data path: cache: revalidate-tag [invoices]",
          source: {
            file: "src/features/invoices/actions.ts",
            line: 10,
            symbol: "revalidateTag",
          },
        }),
        expect.objectContaining({
          label: "data path: remote: next-fetch [invoices]",
          source: {
            file: "src/app/invoices/page.tsx",
            line: 19,
            symbol: "fetch",
          },
        }),
        expect.objectContaining({
          label: "likely edit target",
          source: {
            file: "src/features/invoices/actions.ts",
            line: 6,
            symbol: "saveInvoice",
          },
        }),
      ]),
    );
    const nextClientCallCase = result.cases.find(
      (benchmarkCase) => benchmarkCase.id === "next-client-call-server-action-ownership",
    );
    expect(nextClientCallCase?.repairBrief.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "ui: Sync invoice",
        }),
        expect.objectContaining({
          label: "effect/hook: server action",
          source: {
            file: "src/features/invoices/actions.ts",
            line: 6,
            symbol: "saveInvoice",
          },
        }),
        expect.objectContaining({
          label: "effect/hook: router refresh",
          source: {
            file: "src/features/invoices/InvoiceClient.tsx",
            line: 36,
            symbol: "refresh",
          },
        }),
        expect.objectContaining({
          label: "next route: /invoices",
        }),
        expect.objectContaining({
          label: "rsc boundary: server to client",
        }),
        expect.objectContaining({
          label: "rsc suspense: Loading invoice editor...",
        }),
        expect.objectContaining({
          label: "rsc boundary prop risk: exportBuilder",
        }),
        expect.objectContaining({
          label: "data path: cache: revalidate-path [/invoices]",
          source: {
            file: "src/features/invoices/actions.ts",
            line: 9,
            symbol: "revalidatePath",
          },
        }),
        expect.objectContaining({
          label: "data path: cache: revalidate-tag [invoices]",
          source: {
            file: "src/features/invoices/actions.ts",
            line: 10,
            symbol: "revalidateTag",
          },
        }),
        expect.objectContaining({
          label: "data path: remote: next-fetch [invoices]",
          source: {
            file: "src/app/invoices/page.tsx",
            line: 19,
            symbol: "fetch",
          },
        }),
      ]),
    );
  });

  test("is available through CLI support", () => {
    const result = runBenchmark({ benchmark: "react-repair" });

    expect(result.benchmark).toBe("react-repair");
    expect(result.score.failed).toBe(0);
    expect(result.score.knownLimits).toBe(1);
  });

  test("exposes the benchmark cases as an examples catalog", () => {
    const result = listExamples({ catalog: "react-repair" });

    expect(result.summary).toBe("26 React repair example(s): 25 must-pass, 1 known-limit.");
    expect(result.examples.at(0)).toMatchObject({
      id: "stale-filter-response",
      expectation: "must-pass",
      commands: {
        index: "yomi index --project fixtures/react-repair-benchmark",
        benchmark: "yomi benchmark react-repair",
        repair:
          'yomi repair "Status filter" --project fixtures/react-repair-benchmark --graph .yomi/graph.json',
      },
    });
    expect(result.examples.at(-1)).toMatchObject({
      id: "dynamic-returned-prop-object-handler",
      expectation: "known-limit",
      knownLimitReason:
        "Yomi does not yet resolve event handlers hidden inside dynamically returned JSX prop objects.",
    });
  });
});
