import { describe, expect, test } from "bun:test";

import { demoGraph } from "../src/yomi-ir";
import {
  runDoubleSubmitVerification,
  runKeyRemountVerification,
  runMissingEffectCleanupVerification,
  runPropRenameImpactVerification,
  runSharedHookRegressionVerification,
  runStaleResponseVerification,
  runUiValidationVerification,
} from "../src/runtime-verifier";
import {
  explainLastFailure,
  runRepair,
  runRuntimeTraceQuery,
  verifyScenario,
} from "../src/cli-support";

describe("runtime verifier", () => {
  test("detects stale response commits in the broken scenario", () => {
    const result = runStaleResponseVerification("broken");

    expect(result.status).toBe("failed");
    expect(result.trace.map((event) => event.kind)).toContain("violation-detected");
    expect(result.trace.at(-1)?.summary).toBe(
      'Visible query is "grace" but rendered customer is Ada Lovelace.',
    );
  });

  test("passes when stale responses are ignored", () => {
    const result = runStaleResponseVerification("fixed");

    expect(result.status).toBe("passed");
    expect(result.trace.map((event) => event.kind)).not.toContain("violation-detected");
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "response-resolved",
          summary: 'Response for "ada" resolves but is ignored because it is stale.',
        }),
      ]),
    );
  });

  test("detects missing effect cleanup after component unmount", () => {
    const broken = runMissingEffectCleanupVerification("broken");
    const fixed = runMissingEffectCleanupVerification("fixed");

    expect(broken.status).toBe("failed");
    expect(broken.trace.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["effect-ran", "component-unmounted", "violation-detected"]),
    );
    expect(broken.trace.map((event) => event.kind)).not.toContain("cleanup-ran");
    expect(broken.trace.at(-1)).toMatchObject({
      graphNodeId: "viewport-tracker-effect",
      kind: "violation-detected",
      source: {
        file: "src/features/viewport/ViewportTrackerPanel.tsx",
        line: 8,
        symbol: "useEffect",
      },
    });
    expect(fixed.status).toBe("passed");
    expect(fixed.trace.map((event) => event.kind)).toContain("cleanup-ran");
    expect(fixed.trace.at(-1)).toMatchObject({
      kind: "response-resolved",
    });
  });

  test("detects double submit while the first request is pending", () => {
    const broken = runDoubleSubmitVerification("broken");
    const fixed = runDoubleSubmitVerification("fixed");

    expect(broken.status).toBe("failed");
    expect(broken.trace.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["action-requested", "request-started", "violation-detected"]),
    );
    expect(
      broken.trace.filter((event) => event.kind === "request-started").map((event) => event.id),
    ).toEqual(["checkout-submit-1-start", "checkout-submit-2-start"]);
    expect(broken.trace.at(-2)).toMatchObject({
      graphNodeId: "checkout-submit-action",
      kind: "violation-detected",
      source: {
        file: "src/features/checkout/CheckoutSubmitPanel.tsx",
        line: 8,
        symbol: "handleSubmit",
      },
    });
    expect(fixed.status).toBe("passed");
    expect(
      fixed.trace.filter((event) => event.kind === "request-started").map((event) => event.id),
    ).toEqual(["checkout-submit-1-start"]);
    expect(fixed.trace.map((event) => event.id)).toContain("checkout-submit-2-ignored");
  });

  test("detects visible UI validation that is not enforced before submit", () => {
    const broken = runUiValidationVerification("broken");
    const fixed = runUiValidationVerification("fixed");

    expect(broken.status).toBe("failed");
    expect(broken.trace.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["state-committed", "request-started", "violation-detected"]),
    );
    expect(broken.trace.at(-1)).toMatchObject({
      graphNodeId: "support-email-form-field",
      kind: "violation-detected",
      source: {
        file: "src/features/billing/SupportValidationForm.tsx",
        line: 32,
        symbol: "required",
      },
    });
    expect(fixed.status).toBe("passed");
    expect(fixed.trace.map((event) => event.kind)).not.toContain("request-started");
    expect(fixed.trace.at(-1)).toMatchObject({
      id: "support-email-submit-blocked",
      kind: "response-resolved",
    });
  });

  test("detects key remount state loss for unsaved local state", () => {
    const broken = runKeyRemountVerification("broken");
    const fixed = runKeyRemountVerification("fixed");

    expect(broken.status).toBe("failed");
    expect(broken.trace.map((event) => event.kind)).toEqual(
      expect.arrayContaining([
        "component-mounted",
        "state-committed",
        "component-unmounted",
        "component-remounted",
        "violation-detected",
      ]),
    );
    expect(broken.trace.at(-1)).toMatchObject({
      graphNodeId: "profile-editor-key-prop",
      kind: "violation-detected",
      source: {
        file: "src/features/profiles/ProfileListPanel.tsx",
        line: 28,
        symbol: "key",
      },
    });
    expect(fixed.status).toBe("passed");
    expect(fixed.trace.map((event) => event.kind)).not.toContain("component-unmounted");
    expect(fixed.trace.at(-1)).toMatchObject({
      id: "profile-name-final",
      kind: "response-resolved",
    });
  });

  test("detects shared hook regression across visible consumers", () => {
    const broken = runSharedHookRegressionVerification("broken");
    const fixed = runSharedHookRegressionVerification("fixed");

    expect(broken.status).toBe("failed");
    expect(broken.trace.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["handler-invoked", "render-committed", "violation-detected"]),
    );
    expect(broken.trace.at(-1)).toMatchObject({
      graphNodeId: "use-shared-search-params-hook",
      kind: "violation-detected",
      source: {
        file: "src/features/search/useSharedSearchParams.ts",
        line: 12,
        symbol: "useSharedSearchParams",
      },
    });
    expect(fixed.status).toBe("passed");
    expect(fixed.trace.map((event) => event.kind)).not.toContain("violation-detected");
    expect(fixed.trace.at(-1)).toMatchObject({
      id: "shared-hook-final",
      kind: "response-resolved",
    });
  });

  test("detects prop rename impact across a component boundary", () => {
    const broken = runPropRenameImpactVerification("broken");
    const fixed = runPropRenameImpactVerification("fixed");

    expect(broken.status).toBe("failed");
    expect(broken.trace.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["render-committed", "handler-invoked", "violation-detected"]),
    );
    expect(broken.trace.at(-1)).toMatchObject({
      graphNodeId: "customer-summary-name-prop",
      kind: "violation-detected",
      source: {
        file: "src/features/customers/CustomerSummaryPanel.tsx",
        line: 18,
        symbol: "displayName",
      },
    });
    expect(fixed.status).toBe("passed");
    expect(fixed.trace.map((event) => event.kind)).not.toContain("violation-detected");
    expect(fixed.trace.at(-1)).toMatchObject({
      id: "customer-summary-name-visible",
      kind: "response-resolved",
    });
  });

  test("CLI verify scenario returns source-linked runtime trace", async () => {
    const result = await verifyScenario({ scenario: "stale-response" });

    expect(result.status).toBe("failed");
    expect(result.issue).toBe("stale-response");
    expect(result.trace.at(-1)).toMatchObject({
      kind: "violation-detected",
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        symbol: "setSelectedCustomer",
      },
    });
    expect(result.violations).toEqual([
      expect.objectContaining({
        id: "verify-final",
        message: 'Visible query is "grace" but rendered customer is Ada Lovelace.',
        graphNodeId: "selected-customer-state",
      }),
    ]);
    expect(result.confidence).toMatchObject({
      level: "high",
    });
    expect(result.repairPlan).toMatchObject({
      status: "resolved",
      editTarget: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 42,
        symbol: "useEffect",
      },
      confidence: {
        level: "high",
      },
    });
  });

  test("CLI verify returns a source-linked missing cleanup repair plan", async () => {
    const broken = await verifyScenario({ scenario: "missing-effect-cleanup" });
    const fixed = await verifyScenario({ scenario: "missing-effect-cleanup-fixed" });

    expect(broken.status).toBe("failed");
    expect(broken.issue).toBe("missing-effect-cleanup");
    expect(broken.violations).toEqual([
      expect.objectContaining({
        id: "viewport-cleanup-final",
        message: "Resize listener remains registered after ViewportTrackerPanel unmounted.",
        graphNodeId: "viewport-tracker-effect",
      }),
    ]);
    expect(broken.editTarget).toEqual({
      file: "src/features/viewport/ViewportTrackerPanel.tsx",
      line: 8,
      symbol: "useEffect",
    });
    expect(broken.repairPlan).toMatchObject({
      status: "resolved",
      confidence: { level: "high" },
      editTarget: {
        file: "src/features/viewport/ViewportTrackerPanel.tsx",
        line: 8,
        symbol: "useEffect",
      },
    });
    expect(broken.repairPlan?.evidenceTrail.map((entry) => entry.role)).toEqual(
      expect.arrayContaining(["visible-surface", "behavior-owner", "verification-risk"]),
    );
    expect(broken.repairBrief?.nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining([
        "ui: Enable viewport tracking",
        "effect cleanup risk: missing cleanup",
        "likely edit target",
      ]),
    );
    expect(fixed.status).toBe("passed");
    expect(fixed.issue).toBeUndefined();
    expect(fixed.violations).toEqual([]);
  });

  test("CLI verify returns a source-linked double submit repair plan", async () => {
    const broken = await verifyScenario({ scenario: "double-submit" });
    const fixed = await verifyScenario({ scenario: "double-submit-fixed" });

    expect(broken.status).toBe("failed");
    expect(broken.issue).toBe("double-submit");
    expect(broken.violations).toEqual([
      expect.objectContaining({
        id: "checkout-submit-double-final",
        message:
          "Submit handler accepted a second submit while the first checkout request was still pending.",
        graphNodeId: "checkout-submit-action",
      }),
    ]);
    expect(broken.editTarget).toEqual({
      file: "src/features/checkout/CheckoutSubmitPanel.tsx",
      line: 8,
      symbol: "handleSubmit",
    });
    expect(broken.repairPlan).toMatchObject({
      status: "resolved",
      confidence: { level: "high" },
      editTarget: {
        file: "src/features/checkout/CheckoutSubmitPanel.tsx",
        line: 8,
        symbol: "handleSubmit",
      },
    });
    expect(broken.repairPlan?.evidenceTrail.map((entry) => `${entry.role}:${entry.label}`)).toEqual(
      expect.arrayContaining([
        "visible-surface:ui: Submit order",
        "state-transition:state touched: isSubmitting",
        "behavior-owner:likely edit target",
      ]),
    );
    expect(broken.doNotStartFrom.map((entry) => entry.source.symbol)).toEqual(
      expect.arrayContaining(["<button>", "disabled"]),
    );
    expect(fixed.status).toBe("passed");
    expect(fixed.issue).toBeUndefined();
    expect(fixed.violations).toEqual([]);
  });

  test("CLI verify returns a source-linked UI validation repair plan", async () => {
    const broken = await verifyScenario({ scenario: "ui-validation-enforcement" });
    const fixed = await verifyScenario({ scenario: "ui-validation-enforcement-fixed" });

    expect(broken.status).toBe("failed");
    expect(broken.issue).toBe("ui-validation-enforcement");
    expect(broken.violations).toEqual([
      expect.objectContaining({
        id: "support-email-validation-final",
        message: "Support email validation is visible but not enforced before submit.",
        graphNodeId: "support-email-form-field",
      }),
    ]);
    expect(broken.editTarget).toEqual({
      file: "src/features/billing/SupportValidationForm.tsx",
      line: 32,
      symbol: "required",
    });
    expect(broken.repairPlan).toMatchObject({
      status: "resolved",
      confidence: { level: "high" },
      editTarget: {
        file: "src/features/billing/SupportValidationForm.tsx",
        line: 32,
        symbol: "required",
      },
    });
    expect(broken.repairBrief?.nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining([
        "ui: Support email",
        "form field: supportEmail",
        "form validation: supportEmail",
        "form error read: supportEmail",
        "form error set: supportEmail",
        "likely edit target",
      ]),
    );
    expect(broken.repairPlan?.evidenceTrail.map((entry) => `${entry.role}:${entry.label}`)).toEqual(
      expect.arrayContaining([
        "visible-surface:ui: Support email",
        "form-ownership:form field: supportEmail",
        "behavior-owner:form validation: supportEmail",
        "form-ownership:form error read: supportEmail",
        "form-ownership:form error set: supportEmail",
      ]),
    );
    expect(broken.doNotStartFrom.map((entry) => entry.source.symbol)).toContain("<input>");
    expect(fixed.status).toBe("passed");
    expect(fixed.issue).toBeUndefined();
    expect(fixed.violations).toEqual([]);
  });

  test("CLI verify returns a source-linked key remount repair plan", async () => {
    const broken = await verifyScenario({ scenario: "key-remount-state-loss" });
    const fixed = await verifyScenario({ scenario: "key-remount-state-loss-fixed" });

    expect(broken.status).toBe("failed");
    expect(broken.issue).toBe("key-remount-state-loss");
    expect(broken.violations).toEqual([
      expect.objectContaining({
        id: "profile-name-remount-final",
        message:
          'Unsaved draft "Ada L." was lost after ProfileEditor remounted for the same profile.',
        graphNodeId: "profile-editor-key-prop",
      }),
    ]);
    expect(broken.editTarget).toEqual({
      file: "src/features/profiles/ProfileListPanel.tsx",
      line: 28,
      symbol: "key",
    });
    expect(broken.repairPlan).toMatchObject({
      status: "resolved",
      confidence: { level: "high" },
      editTarget: {
        file: "src/features/profiles/ProfileListPanel.tsx",
        line: 28,
        symbol: "key",
      },
    });
    expect(broken.repairPlan?.evidenceTrail.map((entry) => `${entry.role}:${entry.label}`)).toEqual(
      expect.arrayContaining([
        "visible-surface:ui: Display name",
        "state-transition:state touched: draftName",
        "behavior-owner:prop: key",
        "behavior-owner:likely edit target",
      ]),
    );
    expect(broken.doNotStartFrom.map((entry) => entry.source.symbol)).toContain("<input>");
    expect(broken.suggestedFixShape).toBe(
      "Fix the parent key identity or remount boundary that owns the child component's local state lifetime.",
    );
    expect(fixed.status).toBe("passed");
    expect(fixed.issue).toBeUndefined();
    expect(fixed.violations).toEqual([]);
  });

  test("CLI verify returns a source-linked shared hook repair plan", async () => {
    const broken = await verifyScenario({ scenario: "shared-hook-regression" });
    const fixed = await verifyScenario({ scenario: "shared-hook-regression-fixed" });

    expect(broken.status).toBe("failed");
    expect(broken.issue).toBe("shared-hook-regression");
    expect(broken.violations).toEqual([
      expect.objectContaining({
        id: "shared-hook-regression-final",
        message:
          "Inventory search updated a shared hook path that cleared OrderSearchPanel query state.",
        graphNodeId: "use-shared-search-params-hook",
      }),
    ]);
    expect(broken.editTarget).toEqual({
      file: "src/features/search/useSharedSearchParams.ts",
      line: 12,
      symbol: "useSharedSearchParams",
    });
    expect(broken.repairPlan).toMatchObject({
      status: "resolved",
      confidence: { level: "high" },
      editTarget: {
        file: "src/features/search/useSharedSearchParams.ts",
        line: 12,
        symbol: "useSharedSearchParams",
      },
    });
    expect(broken.repairPlan?.evidenceTrail.map((entry) => `${entry.role}:${entry.label}`)).toEqual(
      expect.arrayContaining([
        "visible-surface:ui: Inventory search",
        "state-transition:state touched: query",
        "behavior-owner:effect/hook: useSharedSearchParams",
        "behavior-owner:likely edit target",
      ]),
    );
    expect(broken.doNotStartFrom.map((entry) => entry.source.symbol)).toContain("<input>");
    expect(broken.suggestedFixShape).toBe(
      "Fix the shared hook implementation while preserving the behavior of every visible consumer in the repair brief.",
    );
    expect(fixed.status).toBe("passed");
    expect(fixed.issue).toBeUndefined();
    expect(fixed.violations).toEqual([]);
  });

  test("CLI verify returns a source-linked prop rename impact repair plan", async () => {
    const broken = await verifyScenario({ scenario: "prop-rename-impact" });
    const fixed = await verifyScenario({ scenario: "prop-rename-impact-fixed" });

    expect(broken.status).toBe("failed");
    expect(broken.issue).toBe("prop-rename-impact");
    expect(broken.violations).toEqual([
      expect.objectContaining({
        id: "customer-summary-prop-final",
        message:
          "CustomerSummaryPanel passes displayName but CustomerSummaryCard now reads name.",
        graphNodeId: "customer-summary-name-prop",
      }),
    ]);
    expect(broken.editTarget).toEqual({
      file: "src/features/customers/CustomerSummaryPanel.tsx",
      line: 18,
      symbol: "displayName",
    });
    expect(broken.repairPlan).toMatchObject({
      status: "resolved",
      confidence: { level: "high" },
      editTarget: {
        file: "src/features/customers/CustomerSummaryPanel.tsx",
        line: 18,
        symbol: "displayName",
      },
    });
    expect(broken.repairPlan?.evidenceTrail.map((entry) => `${entry.role}:${entry.label}`)).toEqual(
      expect.arrayContaining([
        "visible-surface:ui: Customer name",
        "state-transition:state touched: customer",
        "behavior-owner:prop: displayName",
        "behavior-owner:likely edit target",
      ]),
    );
    expect(broken.doNotStartFrom.map((entry) => entry.source.symbol)).toContain("Customer name");
    expect(broken.suggestedFixShape).toBe(
      "Fix the parent/child prop contract at the source-linked boundary before editing the child display markup.",
    );
    expect(fixed.status).toBe("passed");
    expect(fixed.issue).toBeUndefined();
    expect(fixed.violations).toEqual([]);
  });

  test("runtime trace query can filter by graph node id", () => {
    const result = runRuntimeTraceQuery({ interactionId: "selected-customer-state" });

    expect(result.summary).toBe("3 runtime event(s), 3 source-linked.");
    expect(result.nodes.map((node) => node.label)).toEqual([
      "trace: state-committed",
      "trace: state-committed",
      "trace: violation-detected",
    ]);
  });

  test("runtime trace query exposes missing cleanup verifier traces", () => {
    const all = runRuntimeTraceQuery({ interactionId: "missing-effect-cleanup" });
    const effectOnly = runRuntimeTraceQuery({ interactionId: "viewport-tracker-effect" });

    expect(all.summary).toBe("6 runtime event(s), 6 source-linked.");
    expect(all.nodes.map((node) => node.label)).toContain("trace: violation-detected");
    expect(effectOnly.nodes.map((node) => node.label)).toEqual([
      "trace: effect-ran",
      "trace: handler-invoked",
      "trace: violation-detected",
    ]);
  });

  test("runtime trace query exposes double submit verifier traces", () => {
    const all = runRuntimeTraceQuery({ interactionId: "double-submit" });
    const actionOnly = runRuntimeTraceQuery({ interactionId: "checkout-submit-action" });

    expect(all.summary).toBe("7 runtime event(s), 7 source-linked.");
    expect(all.nodes.map((node) => node.label)).toContain("trace: violation-detected");
    expect(actionOnly.nodes.map((node) => node.label)).toEqual([
      "trace: action-requested",
      "trace: request-started",
      "trace: action-requested",
      "trace: request-started",
      "trace: violation-detected",
      "trace: response-resolved",
    ]);
  });

  test("runtime trace query exposes UI validation enforcement traces", () => {
    const all = runRuntimeTraceQuery({ interactionId: "ui-validation-enforcement" });
    const fieldOnly = runRuntimeTraceQuery({ interactionId: "support-email-form-field" });

    expect(all.summary).toBe("4 runtime event(s), 4 source-linked.");
    expect(all.nodes.map((node) => node.label)).toContain("trace: violation-detected");
    expect(fieldOnly.nodes.map((node) => node.label)).toEqual([
      "trace: state-committed",
      "trace: violation-detected",
    ]);
  });

  test("runtime trace query exposes key remount state loss traces", () => {
    const all = runRuntimeTraceQuery({ interactionId: "key-remount-state-loss" });
    const keyOnly = runRuntimeTraceQuery({ interactionId: "profile-editor-key-prop" });

    expect(all.summary).toBe("8 runtime event(s), 8 source-linked.");
    expect(all.nodes.map((node) => node.label)).toContain("trace: violation-detected");
    expect(keyOnly.nodes.map((node) => node.label)).toEqual([
      "trace: component-unmounted",
      "trace: component-remounted",
      "trace: violation-detected",
    ]);
  });

  test("runtime trace query exposes shared hook regression traces", () => {
    const all = runRuntimeTraceQuery({ interactionId: "shared-hook-regression" });
    const hookOnly = runRuntimeTraceQuery({ interactionId: "use-shared-search-params-hook" });

    expect(all.summary).toBe("5 runtime event(s), 5 source-linked.");
    expect(all.nodes.map((node) => node.label)).toContain("trace: violation-detected");
    expect(hookOnly.nodes.map((node) => node.label)).toEqual([
      "trace: handler-invoked",
      "trace: violation-detected",
    ]);
  });

  test("runtime trace query exposes prop rename impact traces", () => {
    const all = runRuntimeTraceQuery({ interactionId: "prop-rename-impact" });
    const propOnly = runRuntimeTraceQuery({ interactionId: "customer-summary-name-prop" });

    expect(all.summary).toBe("4 runtime event(s), 4 source-linked.");
    expect(all.nodes.map((node) => node.label)).toContain("trace: violation-detected");
    expect(propOnly.nodes.map((node) => node.label)).toEqual([
      "trace: handler-invoked",
      "trace: violation-detected",
    ]);
  });

  test("CLI explain returns the graph-linked repair brief for the latest failure", () => {
    const result = explainLastFailure();

    expect(result.issue).toBe("stale-response");
    expect(result.observedBug).toContain("grace");
    expect(result.editTarget).toEqual({
      file: "src/features/customers/CustomerSearchPanel.tsx",
      line: 42,
      symbol: "useEffect",
    });
    expect(result.repairBrief.query).toBe('getRepairBriefFromUi("Customer search")');
    expect(result.repairBrief.nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining([
        "ui: Customer search",
        "effect/hook: useEffect",
        "likely edit target",
      ]),
    );
    expect(result.nextCommands).toContain('yomi query brief-from-ui "Customer search"');
  });

  test("CLI repair resolves a visible UI target into an agent edit plan", () => {
    const result = runRepair({
      graph: demoGraph,
      target: "Customer search",
    });

    expect(result.status).toBe("resolved");
    expect(result.editTarget).toEqual({
      file: "src/features/customers/CustomerSearchPanel.tsx",
      line: 42,
      symbol: "useEffect",
    });
    expect(result.confidence).toEqual({
      level: "high",
      reasons: expect.arrayContaining([
        "repair brief contains a likely edit target",
        "visible UI surface is linked to source",
        "state/effect/data/store ownership evidence is present",
        "display-only evidence is separated from the edit target",
      ]),
    });
    expect(result.whyEditTarget).toContain(
      "source-linked behavior owner for this visible UI path",
    );
    expect(result.evidenceTrail.map((entry) => `${entry.role}:${entry.label}`)).toEqual(
      expect.arrayContaining([
        "visible-surface:ui: Customer search",
        "state-transition:state touched: query",
        "behavior-owner:effect/hook: useEffect",
        "behavior-owner:likely edit target",
      ]),
    );
    expect(result.suggestedFixShape).toBe(
      "Fix the effect, cleanup, async ordering, or state commit path that owns the visible behavior.",
    );
    expect(result.doNotStartFrom.map((entry) => entry.source.symbol)).toEqual(
      expect.arrayContaining(["<SearchInput />", "SearchInput"]),
    );
    expect(result.repairBrief.query).toBe('getRepairBriefFromUi("Customer search")');
    expect(result.nextCommands).toContain('yomi query brief-from-ui "Customer search"');
    expect(result.nextCommands).toContain('yomi query action-path "edit-query-action"');
    expect(result.nextCommands).toContain('yomi query data-path "edit-query-action"');
    expect(result.nextCommands).toContain("yomi verify <scenario> --scenarioFile <path> --url <url>");
    expect(result.verificationPlan).toContain(
      "Run the browser scenario that reproduces the visible UI symptom.",
    );
  });

  test("CLI repair can return an executable verifier command when scenario context is provided", () => {
    const result = runRepair({
      graph: demoGraph,
      scenarioFile: "fixtures/scenarios/customer-search-consistency-graph.json",
      target: "Customer search",
      url: "http://127.0.0.1:5173",
    });

    expect(result.nextCommands).toContain(
      'yomi verify browser-scenario --scenarioFile "fixtures/scenarios/customer-search-consistency-graph.json" --url "http://127.0.0.1:5173"',
    );
    expect(result.verificationPlan).toContain(
      'Run yomi verify browser-scenario --scenarioFile "fixtures/scenarios/customer-search-consistency-graph.json" --url "http://127.0.0.1:5173" after the source change.',
    );
  });
});
