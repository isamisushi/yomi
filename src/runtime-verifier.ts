import type { SourceLocation, TraceEvent } from "./yomi-ir";

export type StaleResponseVerificationMode = "broken" | "fixed";
export type MissingEffectCleanupVerificationMode = "broken" | "fixed";
export type DoubleSubmitVerificationMode = "broken" | "fixed";
export type UiValidationVerificationMode = "broken" | "fixed";
export type KeyRemountVerificationMode = "broken" | "fixed";
export type SharedHookRegressionVerificationMode = "broken" | "fixed";
export type PropRenameImpactVerificationMode = "broken" | "fixed";

export type StaleResponseVerificationResult = {
  readonly status: "failed" | "passed";
  readonly summary: string;
  readonly trace: readonly TraceEvent[];
};

type Customer = {
  readonly name: string;
};

type SearchRequest = {
  readonly id: number;
  readonly query: string;
  readonly customer: Customer;
  readonly resolveAt: number;
};

const effectSource: SourceLocation = {
  file: "src/features/customers/CustomerSearchPanel.tsx",
  line: 42,
  symbol: "useEffect",
};

const fetchSource: SourceLocation = {
  file: "src/features/customers/CustomerSearchPanel.tsx",
  line: 45,
  symbol: "fetchCustomer",
};

const commitSource: SourceLocation = {
  file: "src/features/customers/CustomerSearchPanel.tsx",
  line: 50,
  symbol: "setSelectedCustomer",
};

const viewportEffectSource: SourceLocation = {
  file: "src/features/viewport/ViewportTrackerPanel.tsx",
  line: 8,
  symbol: "useEffect",
};

const viewportListenerSource: SourceLocation = {
  file: "src/features/viewport/ViewportTrackerPanel.tsx",
  line: 17,
  symbol: "addEventListener",
};

const viewportActionSource: SourceLocation = {
  file: "src/features/viewport/ViewportTrackerPanel.tsx",
  line: 25,
  symbol: "onClick",
};

const checkoutSubmitSource: SourceLocation = {
  file: "src/features/checkout/CheckoutSubmitPanel.tsx",
  line: 8,
  symbol: "handleSubmit",
};

const checkoutButtonSource: SourceLocation = {
  file: "src/features/checkout/CheckoutSubmitPanel.tsx",
  line: 31,
  symbol: "onClick",
};

const checkoutCommitSource: SourceLocation = {
  file: "src/features/checkout/CheckoutSubmitPanel.tsx",
  line: 12,
  symbol: "setIsSubmitting",
};

const supportEmailInputSource: SourceLocation = {
  file: "src/features/billing/SupportValidationForm.tsx",
  line: 30,
  symbol: "<input>",
};

const supportEmailValidationSource: SourceLocation = {
  file: "src/features/billing/SupportValidationForm.tsx",
  line: 32,
  symbol: "required",
};

const supportEmailErrorSource: SourceLocation = {
  file: "src/features/billing/SupportValidationForm.tsx",
  line: 37,
  symbol: "supportEmail",
};

const supportEmailSubmitSource: SourceLocation = {
  file: "src/features/billing/SupportValidationForm.tsx",
  line: 16,
  symbol: "handleServerValidation",
};

const profileNameInputSource: SourceLocation = {
  file: "src/features/profiles/ProfileEditor.tsx",
  line: 18,
  symbol: "<input>",
};

const profileDraftStateSource: SourceLocation = {
  file: "src/features/profiles/ProfileEditor.tsx",
  line: 8,
  symbol: "draftName",
};

const profileEditorSource: SourceLocation = {
  file: "src/features/profiles/ProfileEditor.tsx",
  line: 5,
  symbol: "ProfileEditor",
};

const profileSortActionSource: SourceLocation = {
  file: "src/features/profiles/ProfileListPanel.tsx",
  line: 14,
  symbol: "setSortMode",
};

const profileEditorKeySource: SourceLocation = {
  file: "src/features/profiles/ProfileListPanel.tsx",
  line: 28,
  symbol: "key",
};

const inventorySearchInputSource: SourceLocation = {
  file: "src/features/inventory/InventorySearchPanel.tsx",
  line: 22,
  symbol: "<input>",
};

const inventoryQueryStateSource: SourceLocation = {
  file: "src/features/inventory/InventorySearchPanel.tsx",
  line: 7,
  symbol: "query",
};

const orderSearchInputSource: SourceLocation = {
  file: "src/features/orders/OrderSearchPanel.tsx",
  line: 21,
  symbol: "<input>",
};

const sharedSearchHookSource: SourceLocation = {
  file: "src/features/search/useSharedSearchParams.ts",
  line: 12,
  symbol: "useSharedSearchParams",
};

const customerSummaryCardSource: SourceLocation = {
  file: "src/features/customers/CustomerSummaryCard.tsx",
  line: 5,
  symbol: "CustomerSummaryCard",
};

const customerSummaryNamePropSource: SourceLocation = {
  file: "src/features/customers/CustomerSummaryPanel.tsx",
  line: 18,
  symbol: "displayName",
};

const customerSummaryNameUiSource: SourceLocation = {
  file: "src/features/customers/CustomerSummaryCard.tsx",
  line: 12,
  symbol: "Customer name",
};

export function runStaleResponseVerification(
  mode: StaleResponseVerificationMode,
): StaleResponseVerificationResult {
  const trace: TraceEvent[] = [];
  const requests: readonly SearchRequest[] = [
    {
      id: 1,
      query: "ada",
      customer: { name: "Ada Lovelace" },
      resolveAt: 34,
    },
    {
      id: 2,
      query: "grace",
      customer: { name: "Grace Hopper" },
      resolveAt: 19,
    },
  ];
  let latestQuery = "";
  let latestRequestId = 0;
  let selectedCustomer: Customer | undefined;

  trace.push({
    id: "verify-1",
    at: "00:00",
    kind: "action-requested",
    summary: 'User types "ada", then quickly types "grace".',
    graphNodeId: "edit-query-action",
    correlationId: "customer-search",
  });

  for (const request of requests) {
    latestQuery = request.query;
    latestRequestId = request.id;
    trace.push({
      id: `verify-request-${request.id}`,
      at: request.id === 1 ? "00:00" : "00:08",
      kind: "request-started",
      summary: `Request ${request.id} starts for query "${request.query}".`,
      source: fetchSource,
      graphNodeId: "customer-search-effect",
      correlationId: "customer-search",
    });
  }

  for (const request of [...requests].sort((left, right) => left.resolveAt - right.resolveAt)) {
    const at = formatTimestamp(request.resolveAt);
    if (mode === "fixed" && request.id !== latestRequestId) {
      trace.push({
        id: `verify-ignore-${request.id}`,
        at,
        kind: "response-resolved",
        summary: `Response for "${request.query}" resolves but is ignored because it is stale.`,
        source: effectSource,
        graphNodeId: "customer-search-effect",
        correlationId: "customer-search",
      });
      continue;
    }

    selectedCustomer = request.customer;
    trace.push({
      id: `verify-commit-${request.id}`,
      at,
      kind: "state-committed",
      summary: `Response for "${request.query}" commits ${request.customer.name}.`,
      source: commitSource,
      graphNodeId: "selected-customer-state",
      correlationId: "customer-search",
    });
  }

  const finalCustomer = selectedCustomer?.name ?? "";
  const passed = latestQuery === "grace" && finalCustomer === "Grace Hopper";
  trace.push({
    id: "verify-final",
    at: "00:35",
    kind: passed ? "response-resolved" : "violation-detected",
    summary: passed
      ? 'Visible query is "grace" and rendered customer is Grace Hopper.'
      : `Visible query is "grace" but rendered customer is ${finalCustomer}.`,
    source: passed ? effectSource : commitSource,
    graphNodeId: passed ? "customer-search-effect" : "selected-customer-state",
    correlationId: "customer-search",
  });

  return {
    status: passed ? "passed" : "failed",
    summary: passed
      ? "Stale responses are ignored before they can overwrite selectedCustomer."
      : "selectedCustomer can be overwritten by an older response.",
    trace,
  };
}

export function runPropRenameImpactVerification(
  mode: PropRenameImpactVerificationMode,
): StaleResponseVerificationResult {
  const propContractAligned = mode === "fixed";
  const trace: TraceEvent[] = [
    {
      id: "customer-summary-render-requested",
      at: "00:00",
      kind: "render-committed",
      summary: "CustomerSummaryPanel renders CustomerSummaryCard for Ada Lovelace.",
      source: customerSummaryCardSource,
      graphNodeId: "customer-summary-card",
      correlationId: "customer-summary-props",
      runtimeInstanceId: "customer-summary-card-ada",
    },
    {
      id: "customer-summary-prop-boundary",
      at: "00:01",
      kind: "handler-invoked",
      summary: propContractAligned
        ? "Parent passes name to the child prop contract."
        : "Parent passes displayName after the child prop contract was renamed to name.",
      source: customerSummaryNamePropSource,
      graphNodeId: "customer-summary-name-prop",
      correlationId: "customer-summary-props",
      runtimeInstanceId: "customer-summary-card-ada",
    },
  ];

  if (propContractAligned) {
    trace.push({
      id: "customer-summary-name-visible",
      at: "00:02",
      kind: "response-resolved",
      summary: "CustomerSummaryCard renders customer name Ada Lovelace.",
      source: customerSummaryNameUiSource,
      graphNodeId: "customer-summary-name-ui",
      correlationId: "customer-summary-props",
      runtimeInstanceId: "customer-summary-card-ada",
    });
  } else {
    trace.push(
      {
        id: "customer-summary-name-empty",
        at: "00:02",
        kind: "render-committed",
        summary: "CustomerSummaryCard renders an empty customer name because props.name is undefined.",
        source: customerSummaryNameUiSource,
        graphNodeId: "customer-summary-name-ui",
        correlationId: "customer-summary-props",
        runtimeInstanceId: "customer-summary-card-ada",
      },
      {
        id: "customer-summary-prop-final",
        at: "00:03",
        kind: "violation-detected",
        summary:
          "CustomerSummaryPanel passes displayName but CustomerSummaryCard now reads name.",
        source: customerSummaryNamePropSource,
        graphNodeId: "customer-summary-name-prop",
        correlationId: "customer-summary-props",
        runtimeInstanceId: "customer-summary-card-ada",
      },
    );
  }

  return {
    status: propContractAligned ? "passed" : "failed",
    summary: propContractAligned
      ? "Parent and child prop names are aligned across the component boundary."
      : "A parent/child prop rename mismatch leaves the visible customer name empty.",
    trace,
  };
}

export function runSharedHookRegressionVerification(
  mode: SharedHookRegressionVerificationMode,
): StaleResponseVerificationResult {
  const preserveCallerScope = mode === "fixed";
  const trace: TraceEvent[] = [
    {
      id: "inventory-search-edit",
      at: "00:00",
      kind: "action-requested",
      summary: 'User types "paper" in Inventory search.',
      source: inventorySearchInputSource,
      graphNodeId: "inventory-search-action",
      correlationId: "shared-search-hook",
      runtimeInstanceId: "inventory-search-panel",
    },
    {
      id: "inventory-query-committed",
      at: "00:01",
      kind: "state-committed",
      summary: 'Inventory query committed as "paper".',
      source: inventoryQueryStateSource,
      graphNodeId: "inventory-query-state",
      correlationId: "shared-search-hook",
      runtimeInstanceId: "inventory-search-panel",
    },
    {
      id: "shared-search-hook-invoked",
      at: "00:01",
      kind: "handler-invoked",
      summary: "useSharedSearchParams writes the search param for the Inventory search caller.",
      source: sharedSearchHookSource,
      graphNodeId: "use-shared-search-params-hook",
      correlationId: "shared-search-hook",
      runtimeInstanceId: "inventory-search-panel",
    },
  ];

  if (preserveCallerScope) {
    trace.push(
      {
        id: "order-search-preserved",
        at: "00:02",
        kind: "render-committed",
        summary: "OrderSearchPanel keeps its existing query while Inventory search updates.",
        source: orderSearchInputSource,
        graphNodeId: "order-search-input",
        correlationId: "shared-search-hook",
        runtimeInstanceId: "order-search-panel",
      },
      {
        id: "shared-hook-final",
        at: "00:03",
        kind: "response-resolved",
        summary: "Shared hook preserved caller-specific search params.",
        source: sharedSearchHookSource,
        graphNodeId: "use-shared-search-params-hook",
        correlationId: "shared-search-hook",
      },
    );
  } else {
    trace.push(
      {
        id: "order-search-regressed",
        at: "00:02",
        kind: "render-committed",
        summary: "OrderSearchPanel query was cleared by the shared hook update.",
        source: orderSearchInputSource,
        graphNodeId: "order-search-input",
        correlationId: "shared-search-hook",
        runtimeInstanceId: "order-search-panel",
      },
      {
        id: "shared-hook-regression-final",
        at: "00:03",
        kind: "violation-detected",
        summary:
          "Inventory search updated a shared hook path that cleared OrderSearchPanel query state.",
        source: sharedSearchHookSource,
        graphNodeId: "use-shared-search-params-hook",
        correlationId: "shared-search-hook",
      },
    );
  }

  return {
    status: preserveCallerScope ? "passed" : "failed",
    summary: preserveCallerScope
      ? "Shared search hook preserves caller-specific query state across consumers."
      : "Shared search hook update regresses another UI consumer.",
    trace,
  };
}

export function runKeyRemountVerification(
  mode: KeyRemountVerificationMode,
): StaleResponseVerificationResult {
  const stableKey = mode === "fixed";
  const firstInstanceId = "profile-editor-alovelace-name";
  const remountedInstanceId = stableKey
    ? firstInstanceId
    : "profile-editor-alovelace-name-compact";
  const trace: TraceEvent[] = [
    {
      id: "profile-editor-mount",
      at: "00:00",
      kind: "component-mounted",
      summary: "ProfileEditor mounted for Ada Lovelace.",
      source: profileEditorSource,
      graphNodeId: "profile-editor",
      correlationId: "profile-name-edit",
      runtimeInstanceId: firstInstanceId,
    },
    {
      id: "profile-name-edit",
      at: "00:01",
      kind: "action-requested",
      summary: 'User types draft display name "Ada L.".',
      source: profileNameInputSource,
      graphNodeId: "profile-name-edit-action",
      correlationId: "profile-name-edit",
      runtimeInstanceId: firstInstanceId,
    },
    {
      id: "profile-name-draft-committed",
      at: "00:01",
      kind: "state-committed",
      summary: 'draftName committed as "Ada L.".',
      source: profileDraftStateSource,
      graphNodeId: "profile-name-draft-state",
      correlationId: "profile-name-edit",
      runtimeInstanceId: firstInstanceId,
    },
    {
      id: "profile-sort-changed",
      at: "00:02",
      kind: "action-requested",
      summary: "User changes profile list sort mode while the draft is unsaved.",
      source: profileSortActionSource,
      graphNodeId: "profile-list-sort-action",
      correlationId: "profile-name-edit",
    },
  ];

  if (stableKey) {
    trace.push(
      {
        id: "profile-editor-render-preserved",
        at: "00:03",
        kind: "render-committed",
        summary: "ProfileEditor re-rendered with the same key and preserved draftName.",
        source: profileEditorKeySource,
        graphNodeId: "profile-editor-key-prop",
        correlationId: "profile-name-edit",
        runtimeInstanceId: firstInstanceId,
      },
      {
        id: "profile-name-final",
        at: "00:04",
        kind: "response-resolved",
        summary: 'Visible draft remains "Ada L." after the parent sort change.',
        source: profileDraftStateSource,
        graphNodeId: "profile-name-draft-state",
        correlationId: "profile-name-edit",
        runtimeInstanceId: firstInstanceId,
      },
    );
  } else {
    trace.push(
      {
        id: "profile-editor-unmount",
        at: "00:03",
        kind: "component-unmounted",
        summary: "ProfileEditor unmounted because the parent key changed.",
        source: profileEditorKeySource,
        graphNodeId: "profile-editor-key-prop",
        correlationId: "profile-name-edit",
        runtimeInstanceId: firstInstanceId,
      },
      {
        id: "profile-editor-remount",
        at: "00:03",
        kind: "component-mounted",
        summary: "ProfileEditor remounted for the same profile with empty local draft state.",
        source: profileEditorSource,
        graphNodeId: "profile-editor",
        correlationId: "profile-name-edit",
        runtimeInstanceId: remountedInstanceId,
      },
      {
        id: "profile-editor-key-remounted",
        at: "00:03",
        kind: "component-remounted",
        summary: "ProfileEditor received a new runtime instance because the parent key changed.",
        source: profileEditorKeySource,
        graphNodeId: "profile-editor-key-prop",
        correlationId: "profile-name-edit",
        runtimeInstanceId: remountedInstanceId,
      },
      {
        id: "profile-name-remount-final",
        at: "00:04",
        kind: "violation-detected",
        summary: 'Unsaved draft "Ada L." was lost after ProfileEditor remounted for the same profile.',
        source: profileEditorKeySource,
        graphNodeId: "profile-editor-key-prop",
        correlationId: "profile-name-edit",
        runtimeInstanceId: remountedInstanceId,
      },
    );
  }

  return {
    status: stableKey ? "passed" : "failed",
    summary: stableKey
      ? "ProfileEditor keeps a stable key and preserves unsaved local state across parent re-renders."
      : "ProfileEditor remounts for the same profile and loses unsaved local state.",
    trace,
  };
}

export function runUiValidationVerification(
  mode: UiValidationVerificationMode,
): StaleResponseVerificationResult {
  const enforceValidation = mode === "fixed";
  const trace: TraceEvent[] = [
    {
      id: "support-email-edit",
      at: "00:00",
      kind: "action-requested",
      summary: 'User leaves Support email empty and requests validation.',
      source: supportEmailInputSource,
      graphNodeId: "support-email-change-action",
      correlationId: "support-email-validation",
    },
    {
      id: "support-email-validation-error",
      at: "00:01",
      kind: "state-committed",
      summary: "Support email validation error is shown.",
      source: supportEmailErrorSource,
      graphNodeId: "support-email-form-field",
      correlationId: "support-email-validation",
    },
  ];

  if (enforceValidation) {
    trace.push({
      id: "support-email-submit-blocked",
      at: "00:02",
      kind: "response-resolved",
      summary: "Submit was blocked while Support email has a visible validation error.",
      source: supportEmailValidationSource,
      graphNodeId: "support-email-form-field",
      correlationId: "support-email-validation",
    });
  } else {
    trace.push(
      {
        id: "support-email-request-started",
        at: "00:02",
        kind: "request-started",
        summary: "Validation request starts despite a visible Support email error.",
        source: supportEmailSubmitSource,
        graphNodeId: "support-email-change-action",
        correlationId: "support-email-validation",
      },
      {
        id: "support-email-validation-final",
        at: "00:03",
        kind: "violation-detected",
        summary: "Support email validation is visible but not enforced before submit.",
        source: supportEmailValidationSource,
        graphNodeId: "support-email-form-field",
        correlationId: "support-email-validation",
      },
    );
  }

  return {
    status: enforceValidation ? "passed" : "failed",
    summary: enforceValidation
      ? "Visible Support email validation blocks submission."
      : "Visible Support email validation does not block submission.",
    trace,
  };
}

export function runDoubleSubmitVerification(
  mode: DoubleSubmitVerificationMode,
): StaleResponseVerificationResult {
  const guardSecondSubmit = mode === "fixed";
  const trace: TraceEvent[] = [
    {
      id: "checkout-submit-1",
      at: "00:00",
      kind: "action-requested",
      summary: "User clicks Submit order.",
      source: checkoutButtonSource,
      graphNodeId: "checkout-submit-action",
      correlationId: "checkout-submit",
    },
    {
      id: "checkout-submit-1-start",
      at: "00:00",
      kind: "request-started",
      summary: "Checkout submit request 1 starts.",
      source: checkoutSubmitSource,
      graphNodeId: "checkout-submit-action",
      correlationId: "checkout-submit",
    },
    {
      id: "checkout-submit-1-pending",
      at: "00:01",
      kind: "state-committed",
      summary: "isSubmitting committed as true.",
      source: checkoutCommitSource,
      graphNodeId: "checkout-is-submitting-state",
      correlationId: "checkout-submit",
    },
    {
      id: "checkout-submit-2",
      at: "00:02",
      kind: "action-requested",
      summary: "User clicks Submit order again before request 1 resolves.",
      source: checkoutButtonSource,
      graphNodeId: "checkout-submit-action",
      correlationId: "checkout-submit",
    },
  ];

  if (guardSecondSubmit) {
    trace.push({
      id: "checkout-submit-2-ignored",
      at: "00:02",
      kind: "response-resolved",
      summary: "Second submit was ignored because isSubmitting is already true.",
      source: checkoutSubmitSource,
      graphNodeId: "checkout-submit-action",
      correlationId: "checkout-submit",
    });
  } else {
    trace.push(
      {
        id: "checkout-submit-2-start",
        at: "00:02",
        kind: "request-started",
        summary: "Checkout submit request 2 starts while request 1 is still pending.",
        source: checkoutSubmitSource,
        graphNodeId: "checkout-submit-action",
        correlationId: "checkout-submit",
      },
      {
        id: "checkout-submit-double-final",
        at: "00:03",
        kind: "violation-detected",
        summary:
          "Submit handler accepted a second submit while the first checkout request was still pending.",
        source: checkoutSubmitSource,
        graphNodeId: "checkout-submit-action",
        correlationId: "checkout-submit",
      },
    );
  }

  trace.push({
    id: "checkout-submit-1-resolved",
    at: "00:07",
    kind: "response-resolved",
    summary: "Checkout submit request 1 resolves.",
    source: checkoutSubmitSource,
    graphNodeId: "checkout-submit-action",
    correlationId: "checkout-submit",
  });

  return {
    status: guardSecondSubmit ? "passed" : "failed",
    summary: guardSecondSubmit
      ? "Second submit is ignored while the first checkout request is pending."
      : "Submit handler can start a second checkout request before the first resolves.",
    trace,
  };
}

export function runMissingEffectCleanupVerification(
  mode: MissingEffectCleanupVerificationMode,
): StaleResponseVerificationResult {
  const cleanupRegistered = mode === "fixed";
  const trace: TraceEvent[] = [
    {
      id: "viewport-mount",
      at: "00:00",
      kind: "component-mounted",
      summary: "ViewportTrackerPanel mounted.",
      source: {
        file: "src/features/viewport/ViewportTrackerPanel.tsx",
        line: 5,
        symbol: "ViewportTrackerPanel",
      },
      graphNodeId: "viewport-tracker-panel",
      correlationId: "viewport-tracking",
      runtimeInstanceId: "viewport-panel-1",
    },
    {
      id: "viewport-enable",
      at: "00:01",
      kind: "action-requested",
      summary: "User enables viewport tracking.",
      source: viewportActionSource,
      graphNodeId: "viewport-tracker-enable-action",
      correlationId: "viewport-tracking",
      runtimeInstanceId: "viewport-panel-1",
    },
    {
      id: "viewport-effect-ran",
      at: "00:02",
      kind: "effect-ran",
      summary: "Tracking effect attaches a resize listener.",
      source: viewportEffectSource,
      graphNodeId: "viewport-tracker-effect",
      correlationId: "viewport-tracking",
      runtimeInstanceId: "viewport-panel-1",
    },
    {
      id: "viewport-listener-added",
      at: "00:02",
      kind: "handler-invoked",
      summary: "window.addEventListener(\"resize\", handleResize) registered.",
      source: viewportListenerSource,
      graphNodeId: "viewport-tracker-effect",
      correlationId: "viewport-tracking",
      runtimeInstanceId: "viewport-panel-1",
    },
  ];

  if (cleanupRegistered) {
    trace.push({
      id: "viewport-cleanup-ran",
      at: "00:04",
      kind: "cleanup-ran",
      summary: "Tracking effect cleanup removes the resize listener before unmount.",
      source: viewportEffectSource,
      graphNodeId: "viewport-tracker-effect",
      correlationId: "viewport-tracking",
      runtimeInstanceId: "viewport-panel-1",
    });
  }

  trace.push({
    id: "viewport-unmount",
    at: "00:05",
    kind: "component-unmounted",
    summary: "ViewportTrackerPanel unmounted.",
    source: {
      file: "src/features/viewport/ViewportTrackerPanel.tsx",
      line: 5,
      symbol: "ViewportTrackerPanel",
    },
    graphNodeId: "viewport-tracker-panel",
    correlationId: "viewport-tracking",
    runtimeInstanceId: "viewport-panel-1",
  });

  const passed = cleanupRegistered;
  trace.push({
    id: "viewport-cleanup-final",
    at: "00:06",
    kind: passed ? "response-resolved" : "violation-detected",
    summary: passed
      ? "Resize listener was removed before the component unmounted."
      : "Resize listener remains registered after ViewportTrackerPanel unmounted.",
    source: viewportEffectSource,
    graphNodeId: "viewport-tracker-effect",
    correlationId: "viewport-tracking",
    runtimeInstanceId: "viewport-panel-1",
  });

  return {
    status: passed ? "passed" : "failed",
    summary: passed
      ? "Effect cleanup removed the resize listener before unmount."
      : "Effect registers a resize listener without a cleanup before unmount.",
    trace,
  };
}

function formatTimestamp(value: number): string {
  return `00:${String(value).padStart(2, "0")}`;
}
