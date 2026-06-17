import { resolve } from "node:path";

import { extractProjectGraph } from "./extractor";
import { runRepair, type RepairResult } from "./repair";
import type { QueryResult, SourceLocation, YomiGraph } from "./yomi-ir";

export type BenchmarkCase = {
  readonly id: string;
  readonly expectation: "known-limit" | "must-pass";
  readonly title: string;
  readonly symptom: string;
  readonly uiTarget: string;
  readonly expectedEditTarget: SourceExpectation;
  readonly forbiddenEditTargets: readonly SourceExpectation[];
  readonly knownLimitReason?: string;
  readonly requiredEvidenceLabels: readonly string[];
};

export type ReactRepairExample = {
  readonly id: string;
  readonly expectation: BenchmarkCase["expectation"];
  readonly title: string;
  readonly symptom: string;
  readonly uiTarget: string;
  readonly expectedEditTarget: SourceExpectation;
  readonly forbiddenEditTargets: readonly SourceExpectation[];
  readonly knownLimitReason?: string;
  readonly requiredEvidenceLabels: readonly string[];
  readonly projectPath: string;
  readonly commands: {
    readonly index: string;
    readonly benchmark: string;
    readonly repair: string;
  };
};

export type SourceExpectation = {
  readonly file: string;
  readonly symbol: string;
};

export type BenchmarkCaseResult = {
  readonly id: string;
  readonly expectation: BenchmarkCase["expectation"];
  readonly title: string;
  readonly status: "failed" | "known-limit" | "passed";
  readonly summary: string;
  readonly symptom: string;
  readonly uiTarget: string;
  readonly expectedEditTarget: SourceExpectation;
  readonly actualEditTarget?: SourceLocation;
  readonly forbiddenMatches: readonly SourceLocation[];
  readonly repairPlanForbiddenMatches: readonly SourceLocation[];
  readonly knownLimitReason?: string;
  readonly missingEvidenceLabels: readonly string[];
  readonly missingRepairPlanFields: readonly string[];
  readonly repairBrief: QueryResult;
  readonly repairPlan: RepairResult;
};

export type BenchmarkResult = {
  readonly benchmark: "react-repair";
  readonly project: string;
  readonly score: {
    readonly failed: number;
    readonly knownLimits: number;
    readonly mustPass: number;
    readonly passed: number;
    readonly total: number;
  };
  readonly summary: string;
  readonly cases: readonly BenchmarkCaseResult[];
};

export const reactRepairFixturePath = "fixtures/react-repair-benchmark";

export const reactRepairBenchmarkCases: readonly BenchmarkCase[] = [
  {
    id: "stale-filter-response",
    expectation: "must-pass",
    title: "Stale response after filter change",
    symptom:
      "The status filter says Active, but the order list renders results from an older Pending request.",
    uiTarget: "Status filter",
    expectedEditTarget: {
      file: "src/features/orders/OrdersPanel.tsx",
      symbol: "useEffect",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/orders/OrderRow.tsx",
        symbol: "OrderRow",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Status filter",
      "state touched: statusFilter",
      "effect/hook: useEffect",
      "likely edit target",
    ],
  },
  {
    id: "wrong-cache-key-after-save",
    expectation: "must-pass",
    title: "Wrong cache key after save",
    symptom:
      "After saving a customer, the customer list remains stale because the mutation updates a different cache key.",
    uiTarget: "Save customer",
    expectedEditTarget: {
      file: "src/features/customers/CustomerEditor.tsx",
      symbol: "setQueryData",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/customers/CustomerList.tsx",
        symbol: "CustomerList",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Save customer",
      "data path: cache: set-query-data [customer, customer.id]",
      "likely edit target",
    ],
  },
  {
    id: "reducer-derived-total",
    expectation: "must-pass",
    title: "Derived checkout total owned by reducer logic",
    symptom:
      "Changing the shipping method updates the selector, but the checkout total still reflects the previous shipping rate.",
    uiTarget: "Shipping method",
    expectedEditTarget: {
      file: "src/features/checkout/cartReducer.ts",
      symbol: "cartReducer",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/checkout/CheckoutTotal.tsx",
        symbol: "CheckoutTotal",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Shipping method",
      "state touched: cart",
      "effect/hook: useReducer",
      "likely edit target",
    ],
  },
  {
    id: "custom-hook-stale-search",
    expectation: "must-pass",
    title: "Stale inventory search owned by custom hook",
    symptom:
      "The inventory search input says stapler, but the results render an older paper query after the debounce resolves.",
    uiTarget: "Inventory search",
    expectedEditTarget: {
      file: "src/features/inventory/useInventorySearch.ts",
      symbol: "useEffect",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/inventory/InventoryResults.tsx",
        symbol: "InventoryResults",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Inventory search",
      "state touched: query",
      "effect/hook: useInventorySearch",
      "likely edit target",
    ],
  },
  {
    id: "external-store-action-ownership",
    expectation: "must-pass",
    title: "Inventory sort action owned by external store setter",
    symptom:
      "Clicking Sort by name updates through a Zustand-style store, but the visible sort label stays on createdAt because the store setter writes the wrong value.",
    uiTarget: "Sort by name",
    expectedEditTarget: {
      file: "src/features/inventory/inventoryViewStore.ts",
      symbol: "setSortMode",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/inventory/InventorySortLabel.tsx",
        symbol: "InventorySortLabel",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Sort by name",
      "external store: useInventoryViewStore",
      "prop: sortMode",
      "likely edit target",
    ],
  },
  {
    id: "jotai-atom-action-ownership",
    expectation: "must-pass",
    title: "Inventory sort action owned by Jotai atom",
    symptom:
      "Clicking Sort by priority updates a Jotai atom, but the visible sort label starts from createdAt because the atom default owns the stale value.",
    uiTarget: "Sort inventory by priority",
    expectedEditTarget: {
      file: "src/features/inventory/inventorySortAtom.ts",
      symbol: "inventorySortAtom",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/inventory/InventorySortLabel.tsx",
        symbol: "InventorySortLabel",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Sort inventory by priority",
      "external store: inventorySortAtom",
      "prop: sortMode",
      "likely edit target",
    ],
  },
  {
    id: "redux-slice-action-ownership",
    expectation: "must-pass",
    title: "Inventory availability action owned by Redux slice reducer",
    symptom:
      "Clicking Show in-stock dispatches a Redux Toolkit action, but the availability label stays on all because the slice reducer writes the wrong value.",
    uiTarget: "Show in-stock inventory",
    expectedEditTarget: {
      file: "src/features/inventory/inventoryFilterSlice.ts",
      symbol: "setAvailability",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/inventory/InventoryAvailabilityLabel.tsx",
        symbol: "InventoryAvailabilityLabel",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Show in-stock inventory",
      "redux action: setAvailability",
      "redux selector: inventoryFilter.availability",
      "prop: availability",
      "likely edit target",
    ],
  },
  {
    id: "missing-effect-cleanup",
    expectation: "must-pass",
    title: "Resize listener effect missing cleanup",
    symptom:
      "Enabling viewport tracking registers a resize listener, but navigating away or toggling the feature leaves the listener attached.",
    uiTarget: "Enable viewport tracking",
    expectedEditTarget: {
      file: "src/features/viewport/ViewportTrackerPanel.tsx",
      symbol: "useEffect",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/viewport/ViewportStatus.tsx",
        symbol: "ViewportStatus",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Enable viewport tracking",
      "state touched: trackingEnabled",
      "effect/hook: useEffect",
      "effect cleanup risk: missing cleanup",
      "likely edit target",
    ],
  },
  {
    id: "context-provider-derived-value",
    expectation: "must-pass",
    title: "Derived theme preview value owned by context provider",
    symptom:
      "Clicking the theme toggle changes the mode, but the preview keeps the light theme class.",
    uiTarget: "Theme toggle",
    expectedEditTarget: {
      file: "src/features/theme/ThemeContext.tsx",
      symbol: "previewClassName",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/theme/ThemePreview.tsx",
        symbol: "ThemePreview",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Theme toggle",
      "state touched: mode",
      "effect/hook: useContextProvider",
      "context: ThemeContext",
      "likely edit target",
    ],
  },
  {
    id: "mutation-onsuccess-cache-key",
    expectation: "must-pass",
    title: "Wrong invalidation key owned by mutation success handler",
    symptom:
      "After archiving a product, the product list remains stale because the mutation invalidates the singular product key.",
    uiTarget: "Archive product",
    expectedEditTarget: {
      file: "src/features/products/ProductArchivePanel.tsx",
      symbol: "invalidateQueries",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/products/ProductList.tsx",
        symbol: "ProductList",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Archive product",
      "data path: mutation success: archiveMutation",
      "data path: cache: invalidate [product]",
      "likely edit target",
    ],
  },
  {
    id: "mutate-call-onsettled-cache-key",
    expectation: "must-pass",
    title: "Wrong invalidation key owned by mutate call options",
    symptom:
      "After restoring a product, the archived product list remains stale because the mutate call onSettled callback invalidates the singular archived-product key.",
    uiTarget: "Restore product",
    expectedEditTarget: {
      file: "src/features/products/ProductRestorePanel.tsx",
      symbol: "invalidateQueries",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/products/ProductList.tsx",
        symbol: "ProductList",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Restore product",
      "data path: mutation settled: restoreMutation",
      "data path: cache: invalidate [archived-product]",
      "likely edit target",
    ],
  },
  {
    id: "swr-global-mutate-cache-key",
    expectation: "must-pass",
    title: "Wrong SWR mutate key after archive",
    symptom:
      "After archiving a product, the SWR product list remains stale because mutate revalidates the singular product key.",
    uiTarget: "Archive product SWR",
    expectedEditTarget: {
      file: "src/features/products/ProductSWRPanel.tsx",
      symbol: "mutate",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/products/ProductList.tsx",
        symbol: "ProductList",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Archive product SWR",
      "data path: cache: mutate [/api/product]",
      "likely edit target",
    ],
  },
  {
    id: "swr-bound-mutate-optimistic-policy",
    expectation: "must-pass",
    title: "Unsafe SWR optimistic archive policy owned by bound mutate",
    symptom:
      "Archiving a product removes it optimistically, but a failed request does not roll the cache back because rollbackOnError is false.",
    uiTarget: "Archive product optimistically",
    expectedEditTarget: {
      file: "src/features/products/ProductSWROptimisticPanel.tsx",
      symbol: "mutateProducts",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/products/ProductList.tsx",
        symbol: "ProductList",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Archive product optimistically",
      "data path: cache policy: optimistic update",
      "data path: cache: mutate [/api/products]",
      "likely edit target",
    ],
  },
  {
    id: "router-search-param-key",
    expectation: "must-pass",
    title: "Wrong URL search param key after page size change",
    symptom:
      "Changing page size updates the select, but the report table keeps using the old pageSize URL parameter.",
    uiTarget: "Page size",
    expectedEditTarget: {
      file: "src/features/reports/ReportRoute.tsx",
      symbol: "setSearchParams",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/reports/ReportTable.tsx",
        symbol: "ReportTable",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Page size",
      "state touched: searchParams",
      "effect/hook: useSearchParams",
      "likely edit target",
    ],
  },
  {
    id: "router-route-action-ownership",
    expectation: "must-pass",
    title: "Project submit owned by React Router action",
    symptom:
      "Clicking Create project submits a React Router Form; the mutation behavior is owned by the route action rather than the button or input markup.",
    uiTarget: "Create project",
    expectedEditTarget: {
      file: "src/features/projects/ProjectRoute.tsx",
      symbol: "createProjectAction",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/projects/ProjectRoute.tsx",
        symbol: "ProjectRoute",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Create project",
      "effect/hook: route action",
      "likely edit target",
    ],
  },
  {
    id: "router-use-submit-action-ownership",
    expectation: "must-pass",
    title: "Quick project submit owned by useSubmit route action",
    symptom:
      "Clicking Quick create project imperatively submits data with useSubmit; the mutation behavior is owned by the route action.",
    uiTarget: "Quick create project",
    expectedEditTarget: {
      file: "src/features/projects/ProjectRoute.tsx",
      symbol: "createProjectAction",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/projects/ProjectRoute.tsx",
        symbol: "ProjectRoute",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Quick create project",
      "effect/hook: route action",
      "likely edit target",
    ],
  },
  {
    id: "router-fetcher-form-action-ownership",
    expectation: "must-pass",
    title: "Archive project submit owned by fetcher route action",
    symptom:
      "Clicking Archive project submits a fetcher.Form without navigation; the mutation behavior is still owned by the route action.",
    uiTarget: "Archive project",
    expectedEditTarget: {
      file: "src/features/projects/ProjectRoute.tsx",
      symbol: "createProjectAction",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/projects/ProjectRoute.tsx",
        symbol: "ProjectRoute",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Archive project",
      "effect/hook: route action",
      "likely edit target",
    ],
  },
  {
    id: "form-register-field-mapping",
    expectation: "must-pass",
    title: "Billing email input registered to the wrong form field",
    symptom:
      "The billing email input is visible, but saving the form does not update billingEmail because the input is registered as contactEmail.",
    uiTarget: "Billing email",
    expectedEditTarget: {
      file: "src/features/billing/BillingContactForm.tsx",
      symbol: "register",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/billing/BillingContactForm.tsx",
        symbol: "<input>",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Billing email",
      "state touched: billingEmail",
      "effect/hook: useForm",
      "likely edit target",
    ],
  },
  {
    id: "form-validation-error-ownership",
    expectation: "must-pass",
    title: "Support email validation owned by React Hook Form field rules",
    symptom:
      "The support email input is visible, but the broken validation behavior is owned by register options and formState errors, not the rendered input element.",
    uiTarget: "Support email",
    expectedEditTarget: {
      file: "src/features/billing/SupportValidationForm.tsx",
      symbol: "required",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/billing/SupportValidationForm.tsx",
        symbol: "<input>",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Support email",
      "state touched: supportEmail",
      "effect/hook: useForm",
      "form field: supportEmail",
      "form validation: supportEmail",
      "form error read: supportEmail",
      "form error set: supportEmail",
      "likely edit target",
    ],
  },
  {
    id: "form-controller-validation-ownership",
    expectation: "must-pass",
    title: "Shipping country validation owned by Controller rules",
    symptom:
      "The shipping country select is rendered by a custom component, but the broken required validation is owned by React Hook Form Controller rules.",
    uiTarget: "Shipping country",
    expectedEditTarget: {
      file: "src/features/billing/ShippingPreferenceForm.tsx",
      symbol: "required",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/billing/ShippingPreferenceForm.tsx",
        symbol: "CountrySelect",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Shipping country",
      "state touched: shippingCountry",
      "effect/hook: useForm",
      "form field: shippingCountry",
      "form validation: shippingCountry",
      "likely edit target",
    ],
  },
  {
    id: "form-resolver-schema-ownership",
    expectation: "must-pass",
    title: "Account email validation owned by resolver schema",
    symptom:
      "The account email input is visible, but the invalid email behavior is owned by the Zod schema passed through zodResolver.",
    uiTarget: "Account email",
    expectedEditTarget: {
      file: "src/features/billing/AccountSchemaForm.tsx",
      symbol: "accountEmail",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/billing/AccountSchemaForm.tsx",
        symbol: "register",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Account email",
      "state touched: accountEmail",
      "effect/hook: useForm",
      "form field: accountEmail",
      "form validation: accountEmail",
      "form error read: accountEmail",
      "likely edit target",
    ],
  },
  {
    id: "next-form-server-action-ownership",
    expectation: "must-pass",
    title: "Invoice submit owned by Next Server Action",
    symptom:
      "Clicking Submit invoice posts a Next App Router form; the mutation behavior is owned by the server action, not the client button markup.",
    uiTarget: "Submit invoice",
    expectedEditTarget: {
      file: "src/features/invoices/actions.ts",
      symbol: "saveInvoice",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/invoices/InvoiceClient.tsx",
        symbol: "InvoiceClient",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Submit invoice",
      "effect/hook: server action",
      "next route: /invoices",
      "rsc boundary: server to client",
      "rsc suspense: Loading invoice editor...",
      "rsc boundary prop risk: exportBuilder",
      "data path: cache: revalidate-path [/invoices]",
      "data path: cache: revalidate-tag [invoices]",
      "data path: remote: next-fetch [invoices]",
      "likely edit target",
    ],
  },
  {
    id: "next-formaction-server-action-ownership",
    expectation: "must-pass",
    title: "Invoice alternate submit owned by button formAction",
    symptom:
      "Clicking Approve invoice uses a button formAction override; the mutation behavior is still owned by the server action.",
    uiTarget: "Approve invoice",
    expectedEditTarget: {
      file: "src/features/invoices/actions.ts",
      symbol: "saveInvoice",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/invoices/InvoiceClient.tsx",
        symbol: "InvoiceClient",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Approve invoice",
      "effect/hook: server action",
      "next route: /invoices",
      "rsc boundary: server to client",
      "rsc suspense: Loading invoice editor...",
      "rsc boundary prop risk: exportBuilder",
      "data path: cache: revalidate-path [/invoices]",
      "data path: cache: revalidate-tag [invoices]",
      "data path: remote: next-fetch [invoices]",
      "likely edit target",
    ],
  },
  {
    id: "next-client-call-server-action-ownership",
    expectation: "must-pass",
    title: "Client click handler owned by imported Next Server Action",
    symptom:
      "Clicking Sync invoice calls an imported server action from a client event handler; the mutation behavior is owned by the server action.",
    uiTarget: "Sync invoice",
    expectedEditTarget: {
      file: "src/features/invoices/actions.ts",
      symbol: "saveInvoice",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/invoices/InvoiceClient.tsx",
        symbol: "InvoiceClient",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Sync invoice",
      "effect/hook: server action",
      "effect/hook: router refresh",
      "next route: /invoices",
      "rsc boundary: server to client",
      "rsc suspense: Loading invoice editor...",
      "rsc boundary prop risk: exportBuilder",
      "data path: cache: revalidate-path [/invoices]",
      "data path: cache: revalidate-tag [invoices]",
      "data path: remote: next-fetch [invoices]",
      "likely edit target",
    ],
  },
  {
    id: "handler-factory-returned-event-handler",
    expectation: "must-pass",
    title: "Event handler hidden behind an imported handler factory",
    symptom:
      "Clicking Run saved report triggers behavior returned by createReportRunner(reportId); the real repair target is inside the factory, not the button markup.",
    uiTarget: "Run saved report",
    expectedEditTarget: {
      file: "src/features/reports/reportActions.ts",
      symbol: "createReportRunner",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/reports/SavedReportPanel.tsx",
        symbol: "SavedReportPanel",
      },
    ],
    requiredEvidenceLabels: [
      "ui: Run saved report",
      "design-system: Button",
      "prop: onClick",
      "likely edit target",
    ],
  },
  {
    id: "dynamic-returned-prop-object-handler",
    expectation: "known-limit",
    title: "Event handler hidden behind a dynamically returned prop object",
    symptom:
      "Clicking Apply saved preset should run applySavedPreset, but the handler is hidden behind a helper-returned prop object spread.",
    uiTarget: "Apply saved preset",
    expectedEditTarget: {
      file: "src/features/presets/DynamicPresetPanel.tsx",
      symbol: "applySavedPreset",
    },
    forbiddenEditTargets: [
      {
        file: "src/features/presets/DynamicPresetPanel.tsx",
        symbol: "DynamicPresetPanel",
      },
    ],
    knownLimitReason:
      "Yomi does not yet resolve event handlers hidden inside dynamically returned JSX prop objects.",
    requiredEvidenceLabels: ["ui: Apply saved preset"],
  },
];

export function runReactRepairBenchmark(input: {
  readonly projectPath?: string;
}): BenchmarkResult {
  const project = resolve(input.projectPath ?? reactRepairFixturePath);
  const graph = extractProjectGraph({ projectPath: project });
  const cases = reactRepairBenchmarkCases.map((benchmarkCase) =>
    evaluateBenchmarkCase(graph, benchmarkCase),
  );
  const passed = cases.filter((benchmarkCase) => benchmarkCase.status === "passed").length;
  const knownLimits = cases.filter((benchmarkCase) => benchmarkCase.status === "known-limit").length;
  const failed = cases.filter((benchmarkCase) => benchmarkCase.status === "failed").length;
  const mustPass = cases.filter((benchmarkCase) => benchmarkCase.expectation === "must-pass").length;

  return {
    benchmark: "react-repair",
    project,
    score: {
      failed,
      knownLimits,
      mustPass,
      passed,
      total: cases.length,
    },
    summary: `React repair benchmark: ${passed}/${mustPass} must-pass case(s) passed; ${knownLimits} known limit(s).`,
    cases,
  };
}

export function listReactRepairExamples(): readonly ReactRepairExample[] {
  return reactRepairBenchmarkCases.map((benchmarkCase) => ({
    id: benchmarkCase.id,
    expectation: benchmarkCase.expectation,
    title: benchmarkCase.title,
    symptom: benchmarkCase.symptom,
    uiTarget: benchmarkCase.uiTarget,
    expectedEditTarget: benchmarkCase.expectedEditTarget,
    forbiddenEditTargets: benchmarkCase.forbiddenEditTargets,
    knownLimitReason: benchmarkCase.knownLimitReason,
    requiredEvidenceLabels: benchmarkCase.requiredEvidenceLabels,
    projectPath: reactRepairFixturePath,
    commands: {
      index: `yomi index --project ${reactRepairFixturePath}`,
      benchmark: "yomi benchmark react-repair",
      repair: `yomi repair ${JSON.stringify(benchmarkCase.uiTarget)} --project ${reactRepairFixturePath} --graph .yomi/graph.json`,
    },
  }));
}

function evaluateBenchmarkCase(
  graph: YomiGraph,
  benchmarkCase: BenchmarkCase,
): BenchmarkCaseResult {
  const repairPlan = runRepair({ graph, target: benchmarkCase.uiTarget });
  const { repairBrief } = repairPlan;
  const actualEditTarget = repairPlan.editTarget;
  const forbiddenMatches = benchmarkCase.forbiddenEditTargets.flatMap((expectation) =>
    actualEditTarget !== undefined && sourceMatches(actualEditTarget, expectation)
      ? [actualEditTarget]
      : [],
  );
  const repairPlanForbiddenMatches = benchmarkCase.forbiddenEditTargets.flatMap((expectation) =>
    sourceMatches(repairPlan.editTarget, expectation) ? [repairPlan.editTarget] : [],
  );
  const missingEvidenceLabels = benchmarkCase.requiredEvidenceLabels.filter(
    (label) => !repairBrief.nodes.some((node) => node.label === label),
  );
  const missingRepairPlanFields = getMissingRepairPlanFields(repairPlan);
  const passed =
    actualEditTarget !== undefined &&
    sourceMatches(actualEditTarget, benchmarkCase.expectedEditTarget) &&
    sourceMatches(repairPlan.editTarget, benchmarkCase.expectedEditTarget) &&
    forbiddenMatches.length === 0 &&
    repairPlanForbiddenMatches.length === 0 &&
    missingEvidenceLabels.length === 0 &&
    missingRepairPlanFields.length === 0;
  const status: BenchmarkCaseResult["status"] =
    passed ? "passed" : benchmarkCase.expectation === "known-limit" ? "known-limit" : "failed";

  return {
    id: benchmarkCase.id,
    expectation: benchmarkCase.expectation,
    title: benchmarkCase.title,
    status,
    summary: getCaseSummary(status),
    symptom: benchmarkCase.symptom,
    uiTarget: benchmarkCase.uiTarget,
    expectedEditTarget: benchmarkCase.expectedEditTarget,
    actualEditTarget,
    forbiddenMatches,
    repairPlanForbiddenMatches,
    knownLimitReason: benchmarkCase.knownLimitReason,
    missingEvidenceLabels,
    missingRepairPlanFields,
    repairBrief,
    repairPlan,
  };
}

function getMissingRepairPlanFields(repairPlan: RepairResult): readonly string[] {
  const evidenceRoles = new Set(repairPlan.evidenceTrail.map((entry) => entry.role));
  return [
    repairPlan.confidence.level === "low" ? "confidence" : undefined,
    repairPlan.whyEditTarget === "" ? "whyEditTarget" : undefined,
    evidenceRoles.has("visible-surface") ? undefined : "visible-surface evidence",
    evidenceRoles.has("behavior-owner") ? undefined : "behavior-owner evidence",
    repairPlan.doNotStartFrom.length === 0 ? "doNotStartFrom" : undefined,
    repairPlan.suggestedFixShape === "" ? "suggestedFixShape" : undefined,
    repairPlan.nextCommands.length === 0 ? "nextCommands" : undefined,
    repairPlan.verificationPlan.length === 0 ? "verificationPlan" : undefined,
  ].filter((field): field is string => field !== undefined);
}

function getCaseSummary(status: BenchmarkCaseResult["status"]): string {
  switch (status) {
    case "passed":
      return "Yomi reached the expected source-linked edit target from the visible UI symptom.";
    case "known-limit":
      return "Yomi did not reach the expected edit target; this is tracked as a known capability limit.";
    case "failed":
      return "Yomi did not reach the expected source-linked edit target from the visible UI symptom.";
  }
}

function sourceMatches(source: SourceLocation, expectation: SourceExpectation): boolean {
  return source.file === expectation.file && source.symbol === expectation.symbol;
}
