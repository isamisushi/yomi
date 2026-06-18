import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { createStore } from "@crustjs/store";

import {
  listReactRepairExamples,
  reactRepairFixturePath,
  runReactRepairBenchmark,
  type BenchmarkResult,
  type ReactRepairExample,
} from "./benchmark";
import { verifyStaleResponseInBrowser } from "./browser-verifier";
import { runDoctor, type DoctorResult } from "./doctor";
import { extractProjectGraph } from "./extractor";
import { instrumentProject, type InstrumentationResult } from "./instrument";
import { runRepair, type RepairResult } from "./repair";
import { runTracePlan, type TracePlanResult } from "./trace-plan";
import {
  runDoubleSubmitVerification,
  runKeyRemountVerification,
  runMissingEffectCleanupVerification,
  runPropRenameImpactVerification,
  runSharedHookRegressionVerification,
  runStaleResponseVerification,
  runUiValidationVerification,
} from "./runtime-verifier";
import {
  readBrowserScenarioFile,
  verifyBrowserScenario,
  type ScenarioViolation,
} from "./scenario-verifier";
import {
  demoGraph,
  findUiNode,
  getActionPath,
  getComponentOwner,
  getDataPath,
  getEffectsTriggeredBy,
  getHookDependencies,
  getImpact,
  getRepairBrief,
  getRepairBriefFromUi,
  getRuntimeTrace,
  getSourceLocations,
  getStateOwners,
  parseYomiGraph,
  type QueryResult,
  type SourceLocation,
  type TraceEvent,
  type YomiGraph,
} from "./yomi-ir";

export const defaultGraphPath = ".yomi/graph.json";
const indexCacheVersion = "9";

export type CliOutput<T> = {
  readonly ok: boolean;
  readonly data: T;
};

export type CliErrorOutput = {
  readonly ok: false;
  readonly error: {
    readonly name: string;
    readonly message: string;
    readonly code?: string;
  };
};

export type IndexResult = {
  readonly graphPath: string;
  readonly project: string;
  readonly cache: {
    readonly fingerprint: string;
    readonly status: "hit" | "miss" | "bypass";
    readonly storePath: string;
  };
  readonly summary: {
    readonly components: number;
    readonly uiNodes: number;
    readonly states: number;
    readonly hooks: number;
    readonly actions: number;
    readonly remoteData: number;
    readonly cacheOperations: number;
    readonly formFields: number;
    readonly designSystemUsages: number;
    readonly props: number;
    readonly contextUsages: number;
    readonly externalStoreUsages: number;
    readonly reduxActionUsages: number;
    readonly reduxSelectorUsages: number;
  };
  readonly note: string;
};

export type VerifyResult = {
  readonly scenario: string;
  readonly status: "failed" | "passed";
  readonly issue?:
    | "double-submit"
    | "key-remount-state-loss"
    | "missing-effect-cleanup"
    | "prop-rename-impact"
    | "scenario-rule-violation"
    | "shared-hook-regression"
    | "stale-response"
    | "ui-validation-enforcement";
  readonly summary: string;
  readonly editTarget: SourceLocation;
  readonly doNotStartFrom: readonly {
    readonly source: SourceLocation;
    readonly reason: string;
  }[];
  readonly suggestedFixShape: string;
  readonly confidence?: RepairResult["confidence"];
  readonly violations: readonly ScenarioViolation[];
  readonly repairBrief?: QueryResult;
  readonly repairPlan?: RepairResult;
  readonly trace: readonly TraceEvent[];
};

export type ExplainResult = {
  readonly issue: "stale-response";
  readonly summary: string;
  readonly observedBug: string;
  readonly editTarget: SourceLocation;
  readonly doNotStartFrom: readonly {
    readonly source: SourceLocation;
    readonly reason: string;
  }[];
  readonly suggestedFixShape: string;
  readonly repairBrief: QueryResult;
  readonly nextCommands: readonly string[];
};

export { runRepair, type RepairResult };
export { runTracePlan, type TracePlanResult };

export type RunBenchmarkInput = {
  readonly benchmark: string;
  readonly projectPath?: string;
};

export type ExamplesResult = {
  readonly catalog: "react-repair";
  readonly project: string;
  readonly summary: string;
  readonly examples: readonly ReactRepairExample[];
};

export type RunInstrumentInput = {
  readonly adapterImport?: string;
  readonly apply?: boolean;
  readonly graphPath: string;
  readonly projectPath: string;
  readonly queryAdapterImport?: string;
  readonly target?: string;
  readonly targets?: readonly string[];
};

export type RunTracePlanInput = {
  readonly graphPath: string;
  readonly projectPath: string;
  readonly scenarioFile?: string;
  readonly target: string;
  readonly url?: string;
};

export type RunDoctorInput = {
  readonly graphPath: string;
  readonly projectPath: string;
  readonly target?: string;
};

export async function writeDemoGraph(input: {
  readonly force?: boolean;
  readonly outputPath: string;
  readonly projectPath: string;
}): Promise<IndexResult> {
  const graphPath = resolve(input.projectPath, input.outputPath);
  const projectRoot = resolve(input.projectPath);
  const storePath = resolve(projectRoot, ".yomi/index-cache.json");
  await mkdir(dirname(graphPath), { recursive: true });
  await writeFile(`${graphPath}`, `${JSON.stringify(demoGraph, null, 2)}\n`, "utf8");

  return {
    graphPath,
    project: projectRoot,
    cache: {
      fingerprint: "demo",
      status: "bypass",
      storePath,
    },
    summary: summarizeGraph(demoGraph),
    note: "Wrote the bundled demo graph. Use yomi index without --demo to index the current React project.",
  };
}

export async function writeProjectGraph(input: {
  readonly force?: boolean;
  readonly outputPath: string;
  readonly projectPath: string;
}): Promise<IndexResult> {
  const projectRoot = resolve(input.projectPath);
  const graphPath = resolve(projectRoot, input.outputPath);
  const cacheStore = createIndexCacheStore(projectRoot);
  const fingerprint = await fingerprintProject(projectRoot);
  const cached = await cacheStore.read();

  await mkdir(dirname(graphPath), { recursive: true });

  if (
    !input.force &&
    cached.fingerprint === fingerprint &&
    cached.graphJson !== "" &&
    cached.version === indexCacheVersion
  ) {
    await writeFile(`${graphPath}`, `${cached.graphJson}\n`, "utf8");
    const cachedGraph = parseYomiGraph(JSON.parse(cached.graphJson), "cached Yomi graph");
    return {
      graphPath,
      project: projectRoot,
      cache: {
        fingerprint,
        status: "hit",
        storePath: indexCacheStorePath(projectRoot),
      },
      summary: summarizeGraph(cachedGraph),
      note: "Reused cached Yomi graph. Pass --force to rebuild the index.",
    };
  }

  const graph = extractProjectGraph({ projectPath: projectRoot });
  const graphJson = JSON.stringify(graph, null, 2);
  await writeFile(`${graphPath}`, `${graphJson}\n`, "utf8");
  await cacheStore.write({
    fingerprint,
    graphJson,
    graphPath,
    indexedAt: new Date().toISOString(),
    projectRoot,
    version: indexCacheVersion,
  });

  return {
    graphPath,
    project: projectRoot,
    cache: {
      fingerprint,
      status: input.force ? "bypass" : "miss",
      storePath: indexCacheStorePath(projectRoot),
    },
    summary: summarizeGraph(graph),
    note:
      input.force === true
        ? "Rebuilt Yomi graph and refreshed the index cache."
        : "Indexed React components, local state, effects, JSX event actions, remote data, cache operations, and visible UI nodes from TypeScript source.",
  };
}

export async function readGraph(input: {
  readonly graphPath: string;
  readonly projectPath: string;
}): Promise<YomiGraph> {
  const path = resolve(input.projectPath, input.graphPath);
  const raw = await readFile(path, "utf8");
  return parseYomiGraph(JSON.parse(raw), path);
}

export function runQuery(input: {
  readonly graph: YomiGraph;
  readonly query: string;
  readonly target: string;
}): QueryResult {
  switch (input.query) {
    case "component-owner":
      return getComponentOwner(input.graph, input.target);
    case "find-ui-node":
      return findUiNode(input.graph, input.target);
    case "action-path":
      return getActionPath(input.graph, input.target);
    case "data-path":
      return getDataPath(input.graph, input.target);
    case "effects-triggered-by":
      return getEffectsTriggeredBy(input.graph, input.target);
    case "hook-dependencies":
      return getHookDependencies(input.graph, input.target);
    case "impact":
      return getImpact(input.graph, input.target);
    case "repair-brief":
      return getRepairBrief(input.graph, input.target);
    case "brief-from-ui":
      return getRepairBriefFromUi(input.graph, input.target);
    case "source-locations":
      return getSourceLocations(input.graph, input.target);
    case "state-owners":
      return getStateOwners(input.graph, input.target);
    default:
      throw new Error(
        `Unknown query "${input.query}". Expected find-ui-node, component-owner, action-path, data-path, effects-triggered-by, state-owners, hook-dependencies, impact, repair-brief, brief-from-ui, source-locations, or runtime-trace.`,
      );
  }
}

export function runRuntimeTraceQuery(input: {
  readonly interactionId: string;
}): QueryResult {
  const isCleanupTrace =
    input.interactionId === "missing-effect-cleanup" ||
    input.interactionId === "missing-effect-cleanup-fixed" ||
    input.interactionId === "viewport-tracker-effect";
  const isDoubleSubmitTrace =
    input.interactionId === "double-submit" ||
    input.interactionId === "double-submit-fixed" ||
    input.interactionId === "checkout-submit-action";
  const isValidationTrace =
    input.interactionId === "ui-validation-enforcement" ||
    input.interactionId === "ui-validation-enforcement-fixed" ||
    input.interactionId === "support-email-form-field";
  const isKeyRemountTrace =
    input.interactionId === "key-remount-state-loss" ||
    input.interactionId === "key-remount-state-loss-fixed" ||
    input.interactionId === "profile-editor-key-prop";
  const isSharedHookTrace =
    input.interactionId === "shared-hook-regression" ||
    input.interactionId === "shared-hook-regression-fixed" ||
    input.interactionId === "use-shared-search-params-hook";
  const isPropRenameTrace =
    input.interactionId === "prop-rename-impact" ||
    input.interactionId === "prop-rename-impact-fixed" ||
    input.interactionId === "customer-summary-name-prop";
  const mode =
    input.interactionId === "stale-response-fixed" ||
    input.interactionId === "missing-effect-cleanup-fixed" ||
    input.interactionId === "double-submit-fixed" ||
    input.interactionId === "ui-validation-enforcement-fixed" ||
    input.interactionId === "key-remount-state-loss-fixed" ||
    input.interactionId === "shared-hook-regression-fixed" ||
    input.interactionId === "prop-rename-impact-fixed"
      ? "fixed"
      : "broken";
  const result = isCleanupTrace
    ? runMissingEffectCleanupVerification(mode)
    : isDoubleSubmitTrace
      ? runDoubleSubmitVerification(mode)
      : isValidationTrace
        ? runUiValidationVerification(mode)
        : isKeyRemountTrace
          ? runKeyRemountVerification(mode)
          : isSharedHookTrace
            ? runSharedHookRegressionVerification(mode)
            : isPropRenameTrace
              ? runPropRenameImpactVerification(mode)
              : runStaleResponseVerification(mode);
  const traceTarget =
    input.interactionId === "stale-response" ||
    input.interactionId === "stale-response-fixed" ||
    input.interactionId === "missing-effect-cleanup" ||
    input.interactionId === "missing-effect-cleanup-fixed" ||
    input.interactionId === "double-submit" ||
    input.interactionId === "double-submit-fixed" ||
    input.interactionId === "ui-validation-enforcement" ||
    input.interactionId === "ui-validation-enforcement-fixed" ||
    input.interactionId === "key-remount-state-loss" ||
    input.interactionId === "key-remount-state-loss-fixed" ||
    input.interactionId === "shared-hook-regression" ||
    input.interactionId === "shared-hook-regression-fixed" ||
    input.interactionId === "prop-rename-impact" ||
    input.interactionId === "prop-rename-impact-fixed"
      ? "all"
      : input.interactionId;
  return getRuntimeTrace(result.trace, traceTarget);
}

export async function verifyScenario(input: {
  readonly fixed?: boolean;
  readonly graphPath?: string;
  readonly projectPath?: string;
  readonly scenario: string;
  readonly scenarioFile?: string;
  readonly url?: string;
}): Promise<VerifyResult> {
  if (input.scenarioFile !== undefined) {
    const scenario = await readBrowserScenarioFile({
      path: input.scenarioFile,
      projectPath: input.projectPath ?? ".",
    });
    const graph =
      scenario.repairTarget === undefined
        ? undefined
        : await readGraphForScenario({
            graphPath: input.graphPath ?? defaultGraphPath,
            projectPath: input.projectPath ?? ".",
            scenario,
          });
    const result = await verifyBrowserScenario({
      graph,
      scenario,
      url: input.url,
    });
    return {
      scenario: result.scenario,
      status: result.status,
      issue: result.status === "failed" ? "scenario-rule-violation" : undefined,
      summary: result.summary,
      editTarget: result.editTarget,
      doNotStartFrom: result.doNotStartFrom,
      suggestedFixShape: result.suggestedFixShape,
      confidence: result.confidence,
      violations: result.violations,
      repairBrief: result.repairBrief,
      repairPlan: result.repairPlan,
      trace: result.trace,
    };
  }

  const { scenario } = input;
  if (
    scenario !== "stale-response" &&
    scenario !== "stale-response-fixed" &&
    scenario !== "missing-effect-cleanup" &&
    scenario !== "missing-effect-cleanup-fixed" &&
    scenario !== "double-submit" &&
    scenario !== "double-submit-fixed" &&
    scenario !== "ui-validation-enforcement" &&
    scenario !== "ui-validation-enforcement-fixed" &&
    scenario !== "key-remount-state-loss" &&
    scenario !== "key-remount-state-loss-fixed" &&
    scenario !== "shared-hook-regression" &&
    scenario !== "shared-hook-regression-fixed" &&
    scenario !== "prop-rename-impact" &&
    scenario !== "prop-rename-impact-fixed"
  ) {
    throw new Error(
      `Unknown verifier scenario "${scenario}". Expected stale-response, stale-response-fixed, missing-effect-cleanup, missing-effect-cleanup-fixed, double-submit, double-submit-fixed, ui-validation-enforcement, ui-validation-enforcement-fixed, key-remount-state-loss, key-remount-state-loss-fixed, shared-hook-regression, shared-hook-regression-fixed, prop-rename-impact, or prop-rename-impact-fixed.`,
    );
  }
  const mode =
    input.fixed === true ||
    scenario === "stale-response-fixed" ||
    scenario === "missing-effect-cleanup-fixed" ||
    scenario === "double-submit-fixed" ||
    scenario === "ui-validation-enforcement-fixed" ||
    scenario === "key-remount-state-loss-fixed" ||
    scenario === "shared-hook-regression-fixed" ||
    scenario === "prop-rename-impact-fixed"
      ? "fixed"
      : "broken";
  const isCleanupScenario =
    scenario === "missing-effect-cleanup" || scenario === "missing-effect-cleanup-fixed";
  const isDoubleSubmitScenario =
    scenario === "double-submit" || scenario === "double-submit-fixed";
  const isValidationScenario =
    scenario === "ui-validation-enforcement" ||
    scenario === "ui-validation-enforcement-fixed";
  const isKeyRemountScenario =
    scenario === "key-remount-state-loss" || scenario === "key-remount-state-loss-fixed";
  const isSharedHookScenario =
    scenario === "shared-hook-regression" || scenario === "shared-hook-regression-fixed";
  const isPropRenameScenario =
    scenario === "prop-rename-impact" || scenario === "prop-rename-impact-fixed";
  const runtimeResult = isCleanupScenario
    ? runMissingEffectCleanupVerification(mode)
    : isDoubleSubmitScenario
      ? runDoubleSubmitVerification(mode)
      : isValidationScenario
        ? runUiValidationVerification(mode)
        : isKeyRemountScenario
          ? runKeyRemountVerification(mode)
          : isSharedHookScenario
            ? runSharedHookRegressionVerification(mode)
            : isPropRenameScenario
              ? runPropRenameImpactVerification(mode)
              : input.url === undefined
                ? runStaleResponseVerification(mode)
                : await verifyStaleResponseInBrowser({
                    mode: mode === "fixed" ? "toggle-fixed" : "current",
                    url: input.url,
                  });
  const repairPlan = runRepair({
    graph: isCleanupScenario
      ? missingEffectCleanupGraph
      : isDoubleSubmitScenario
        ? doubleSubmitGraph
        : isValidationScenario
          ? uiValidationGraph
          : isKeyRemountScenario
            ? keyRemountGraph
            : isSharedHookScenario
              ? sharedHookRegressionGraph
              : isPropRenameScenario
                ? propRenameImpactGraph
                : demoGraph,
    target: isCleanupScenario
      ? "Enable viewport tracking"
      : isDoubleSubmitScenario
        ? "Submit order"
        : isValidationScenario
          ? "Support email"
          : isKeyRemountScenario
            ? "Display name"
            : isSharedHookScenario
              ? "Inventory search"
              : isPropRenameScenario
                ? "Customer name"
                : "Customer search",
  });

  return {
    scenario,
    status: runtimeResult.status,
    issue:
      runtimeResult.status === "failed"
        ? isCleanupScenario
          ? "missing-effect-cleanup"
          : isDoubleSubmitScenario
            ? "double-submit"
            : isValidationScenario
              ? "ui-validation-enforcement"
              : isKeyRemountScenario
                ? "key-remount-state-loss"
                : isSharedHookScenario
                  ? "shared-hook-regression"
                  : isPropRenameScenario
                    ? "prop-rename-impact"
                    : "stale-response"
        : undefined,
    summary: runtimeResult.summary,
    editTarget: repairPlan.editTarget,
    doNotStartFrom: repairPlan.doNotStartFrom,
    suggestedFixShape: repairPlan.suggestedFixShape,
    confidence: repairPlan.confidence,
    violations: getRuntimeViolations(runtimeResult.trace),
    repairBrief: repairPlan.repairBrief,
    repairPlan,
    trace: runtimeResult.trace,
  };
}

function getRuntimeViolations(trace: readonly TraceEvent[]): readonly ScenarioViolation[] {
  return trace.flatMap((event) =>
    event.kind === "violation-detected"
      ? [
          {
            id: event.id,
            message: event.summary,
            source: event.source,
            graphNodeId: event.graphNodeId,
          },
        ]
      : [],
  );
}

const keyRemountGraph: YomiGraph = {
  components: [
    {
      id: "profile-list-panel",
      name: "ProfileListPanel",
      role: "component",
      runtime: "unknown",
      source: {
        file: "src/features/profiles/ProfileListPanel.tsx",
        line: 4,
        symbol: "ProfileListPanel",
      },
      ownsState: ["profile-sort-mode-state"],
      usesHooks: [],
      renders: ["profile-editor"],
    },
    {
      id: "profile-editor",
      name: "ProfileEditor",
      role: "component",
      runtime: "unknown",
      source: {
        file: "src/features/profiles/ProfileEditor.tsx",
        line: 5,
        symbol: "ProfileEditor",
      },
      ownsState: ["profile-name-draft-state"],
      usesHooks: [],
      renders: [],
    },
  ],
  renderEdges: [
    {
      id: "profile-list-panel-renders-profile-editor",
      ownerComponentId: "profile-list-panel",
      childComponentId: "profile-editor",
      kind: "render",
      source: {
        file: "src/features/profiles/ProfileListPanel.tsx",
        line: 27,
        symbol: "ProfileEditor",
      },
      note: "ProfileListPanel renders ProfileEditor and controls its component identity.",
    },
  ],
  states: [
    {
      id: "profile-sort-mode-state",
      name: "sortMode",
      ownerComponentId: "profile-list-panel",
      kind: "local",
      source: {
        file: "src/features/profiles/ProfileListPanel.tsx",
        line: 7,
        symbol: "sortMode",
      },
    },
    {
      id: "profile-name-draft-state",
      name: "draftName",
      ownerComponentId: "profile-editor",
      kind: "local",
      source: {
        file: "src/features/profiles/ProfileEditor.tsx",
        line: 8,
        symbol: "draftName",
      },
    },
  ],
  hooks: [],
  actions: [
    {
      id: "profile-name-edit-action",
      name: "edit profile display name",
      ownerComponentId: "profile-editor",
      source: {
        file: "src/features/profiles/ProfileEditor.tsx",
        line: 18,
        symbol: "onChange",
      },
      touchesState: ["profile-name-draft-state"],
      triggersHooks: [],
      network: [],
    },
    {
      id: "profile-list-sort-action",
      name: "change profile list sort",
      ownerComponentId: "profile-list-panel",
      source: {
        file: "src/features/profiles/ProfileListPanel.tsx",
        line: 14,
        symbol: "setSortMode",
      },
      touchesState: ["profile-sort-mode-state"],
      triggersHooks: [],
      network: [],
    },
  ],
  ui: [
    {
      id: "profile-name-input",
      label: "Display name",
      role: "input",
      componentId: "profile-editor",
      actionId: "profile-name-edit-action",
      stateIds: ["profile-name-draft-state"],
      source: {
        file: "src/features/profiles/ProfileEditor.tsx",
        line: 18,
        symbol: "<input>",
      },
    },
  ],
  remoteData: [],
  cacheOperations: [],
  formFields: [],
  designSystemUsages: [],
  props: [
    {
      id: "profile-editor-key-prop",
      ownerComponentId: "profile-list-panel",
      targetComponentId: "profile-editor",
      propName: "key",
      kind: "value",
      value: "`${profile.id}:${sortMode}`",
      references: ["profile.id", "sortMode"],
      source: {
        file: "src/features/profiles/ProfileListPanel.tsx",
        line: 28,
        symbol: "key",
      },
      note:
        "Changing sortMode changes the ProfileEditor key, remounts the child component, and causes local draft state loss.",
    },
  ],
  contextUsages: [],
  externalStoreUsages: [],
  reduxActionUsages: [],
  reduxSelectorUsages: [],
};

const sharedHookRegressionGraph: YomiGraph = {
  components: [
    {
      id: "inventory-search-panel",
      name: "InventorySearchPanel",
      role: "component",
      runtime: "unknown",
      source: {
        file: "src/features/inventory/InventorySearchPanel.tsx",
        line: 4,
        symbol: "InventorySearchPanel",
      },
      ownsState: ["inventory-query-state"],
      usesHooks: ["use-shared-search-params-hook"],
      renders: [],
    },
    {
      id: "order-search-panel",
      name: "OrderSearchPanel",
      role: "component",
      runtime: "unknown",
      source: {
        file: "src/features/orders/OrderSearchPanel.tsx",
        line: 4,
        symbol: "OrderSearchPanel",
      },
      ownsState: ["order-query-state"],
      usesHooks: ["use-shared-search-params-hook"],
      renders: [],
    },
  ],
  renderEdges: [],
  states: [
    {
      id: "inventory-query-state",
      name: "query",
      ownerComponentId: "inventory-search-panel",
      kind: "local",
      source: {
        file: "src/features/inventory/InventorySearchPanel.tsx",
        line: 7,
        symbol: "query",
      },
    },
    {
      id: "order-query-state",
      name: "query",
      ownerComponentId: "order-search-panel",
      kind: "local",
      source: {
        file: "src/features/orders/OrderSearchPanel.tsx",
        line: 7,
        symbol: "query",
      },
    },
  ],
  hooks: [
    {
      id: "use-shared-search-params-hook",
      name: "useSharedSearchParams",
      ownerComponentId: "inventory-search-panel",
      kind: "custom",
      dependencies: ["query", "scope"],
      source: {
        file: "src/features/search/useSharedSearchParams.ts",
        line: 12,
        symbol: "useSharedSearchParams",
      },
      risk: "high",
      note:
        "Shared hook is used by InventorySearchPanel and OrderSearchPanel; preserve caller-specific scope before changing query synchronization.",
    },
  ],
  actions: [
    {
      id: "inventory-search-action",
      name: "edit inventory search",
      ownerComponentId: "inventory-search-panel",
      source: {
        file: "src/features/inventory/InventorySearchPanel.tsx",
        line: 22,
        symbol: "onChange",
      },
      touchesState: ["inventory-query-state"],
      triggersHooks: ["use-shared-search-params-hook"],
      network: [],
    },
  ],
  ui: [
    {
      id: "inventory-search-input",
      label: "Inventory search",
      role: "input",
      componentId: "inventory-search-panel",
      actionId: "inventory-search-action",
      stateIds: ["inventory-query-state"],
      source: {
        file: "src/features/inventory/InventorySearchPanel.tsx",
        line: 22,
        symbol: "<input>",
      },
    },
    {
      id: "order-search-input",
      label: "Order search",
      role: "input",
      componentId: "order-search-panel",
      stateIds: ["order-query-state"],
      source: {
        file: "src/features/orders/OrderSearchPanel.tsx",
        line: 21,
        symbol: "<input>",
      },
    },
  ],
  remoteData: [],
  cacheOperations: [],
  formFields: [],
  designSystemUsages: [],
  props: [],
  contextUsages: [],
  externalStoreUsages: [],
  reduxActionUsages: [],
  reduxSelectorUsages: [],
};

const propRenameImpactGraph: YomiGraph = {
  components: [
    {
      id: "customer-summary-panel",
      name: "CustomerSummaryPanel",
      role: "component",
      runtime: "unknown",
      source: {
        file: "src/features/customers/CustomerSummaryPanel.tsx",
        line: 4,
        symbol: "CustomerSummaryPanel",
      },
      ownsState: ["customer-summary-state"],
      usesHooks: [],
      renders: ["customer-summary-card"],
    },
    {
      id: "customer-summary-card",
      name: "CustomerSummaryCard",
      role: "component",
      runtime: "unknown",
      source: {
        file: "src/features/customers/CustomerSummaryCard.tsx",
        line: 5,
        symbol: "CustomerSummaryCard",
      },
      ownsState: [],
      usesHooks: [],
      renders: [],
    },
  ],
  renderEdges: [
    {
      id: "customer-summary-panel-renders-card",
      ownerComponentId: "customer-summary-panel",
      childComponentId: "customer-summary-card",
      kind: "render",
      source: {
        file: "src/features/customers/CustomerSummaryPanel.tsx",
        line: 17,
        symbol: "CustomerSummaryCard",
      },
      note: "CustomerSummaryPanel renders CustomerSummaryCard and owns the prop boundary.",
    },
  ],
  states: [
    {
      id: "customer-summary-state",
      name: "customer",
      ownerComponentId: "customer-summary-panel",
      kind: "local",
      source: {
        file: "src/features/customers/CustomerSummaryPanel.tsx",
        line: 8,
        symbol: "customer",
      },
    },
  ],
  hooks: [],
  actions: [
    {
      id: "customer-summary-render-action",
      name: "render customer summary",
      ownerComponentId: "customer-summary-panel",
      source: {
        file: "src/features/customers/CustomerSummaryPanel.tsx",
        line: 17,
        symbol: "CustomerSummaryCard",
      },
      touchesState: ["customer-summary-state"],
      triggersHooks: [],
      network: [],
    },
  ],
  ui: [
    {
      id: "customer-summary-name-ui",
      label: "Customer name",
      role: "status",
      componentId: "customer-summary-card",
      actionId: "customer-summary-render-action",
      stateIds: ["customer-summary-state"],
      source: {
        file: "src/features/customers/CustomerSummaryCard.tsx",
        line: 12,
        symbol: "Customer name",
      },
    },
  ],
  remoteData: [],
  cacheOperations: [],
  formFields: [],
  designSystemUsages: [],
  props: [
    {
      id: "customer-summary-name-prop",
      ownerComponentId: "customer-summary-panel",
      targetComponentId: "customer-summary-card",
      propName: "displayName",
      kind: "value",
      value: "customer.name",
      references: ["customer.name"],
      source: {
        file: "src/features/customers/CustomerSummaryPanel.tsx",
        line: 18,
        symbol: "displayName",
      },
      note:
        "Prop rename impact: CustomerSummaryCard now reads name, but CustomerSummaryPanel still passes displayName.",
    },
  ],
  contextUsages: [],
  externalStoreUsages: [],
  reduxActionUsages: [],
  reduxSelectorUsages: [],
};

const uiValidationGraph: YomiGraph = {
  components: [
    {
      id: "support-validation-form",
      name: "SupportValidationForm",
      role: "component",
      runtime: "unknown",
      source: {
        file: "src/features/billing/SupportValidationForm.tsx",
        line: 6,
        symbol: "SupportValidationForm",
      },
      ownsState: ["support-email-state"],
      usesHooks: ["support-validation-form-hook"],
      renders: [],
    },
  ],
  renderEdges: [],
  states: [
    {
      id: "support-email-state",
      name: "supportEmail",
      ownerComponentId: "support-validation-form",
      kind: "local",
      source: {
        file: "src/features/billing/SupportValidationForm.tsx",
        line: 14,
        symbol: "supportEmail",
      },
    },
  ],
  hooks: [
    {
      id: "support-validation-form-hook",
      name: "useForm",
      ownerComponentId: "support-validation-form",
      kind: "custom",
      dependencies: [],
      source: {
        file: "src/features/billing/SupportValidationForm.tsx",
        line: 11,
        symbol: "useForm",
      },
      risk: "medium",
      note:
        "React Hook Form owns supportEmail registration, validation, and visible error state.",
    },
  ],
  actions: [
    {
      id: "support-email-change-action",
      name: "edit support email",
      ownerComponentId: "support-validation-form",
      source: {
        file: "src/features/billing/SupportValidationForm.tsx",
        line: 30,
        symbol: "<input>",
      },
      touchesState: ["support-email-state"],
      triggersHooks: ["support-validation-form-hook"],
      network: [],
    },
  ],
  ui: [
    {
      id: "support-email-input",
      label: "Support email",
      role: "input",
      componentId: "support-validation-form",
      actionId: "support-email-change-action",
      stateIds: ["support-email-state"],
      source: {
        file: "src/features/billing/SupportValidationForm.tsx",
        line: 30,
        symbol: "<input>",
      },
    },
  ],
  remoteData: [],
  cacheOperations: [],
  formFields: [
    {
      id: "support-email-form-field",
      name: "supportEmail",
      ownerComponentId: "support-validation-form",
      stateId: "support-email-state",
      register: {
        file: "src/features/billing/SupportValidationForm.tsx",
        line: 31,
        symbol: "register",
      },
      validation: {
        options: [
          {
            name: "required",
            value: '"Support email is required."',
          },
          {
            name: "pattern",
            value: "/@example\\.com$/",
          },
        ],
        source: {
          file: "src/features/billing/SupportValidationForm.tsx",
          line: 32,
          symbol: "required",
        },
      },
      errors: [
        {
          kind: "read",
          reference: "errors.supportEmail",
          source: {
            file: "src/features/billing/SupportValidationForm.tsx",
            line: 37,
            symbol: "supportEmail",
          },
        },
        {
          kind: "set",
          reference: "setError(\"supportEmail\")",
          source: {
            file: "src/features/billing/SupportValidationForm.tsx",
            line: 19,
            symbol: "supportEmail",
          },
        },
      ],
    },
  ],
  designSystemUsages: [],
  props: [],
  contextUsages: [],
  externalStoreUsages: [],
  reduxActionUsages: [],
  reduxSelectorUsages: [],
};

const doubleSubmitGraph: YomiGraph = {
  components: [
    {
      id: "checkout-submit-panel",
      name: "CheckoutSubmitPanel",
      role: "component",
      runtime: "unknown",
      source: {
        file: "src/features/checkout/CheckoutSubmitPanel.tsx",
        line: 4,
        symbol: "CheckoutSubmitPanel",
      },
      ownsState: ["checkout-is-submitting-state"],
      usesHooks: [],
      renders: [],
    },
  ],
  renderEdges: [],
  states: [
    {
      id: "checkout-is-submitting-state",
      name: "isSubmitting",
      ownerComponentId: "checkout-submit-panel",
      kind: "local",
      source: {
        file: "src/features/checkout/CheckoutSubmitPanel.tsx",
        line: 5,
        symbol: "isSubmitting",
      },
    },
  ],
  hooks: [],
  actions: [
    {
      id: "checkout-submit-action",
      name: "submit checkout",
      ownerComponentId: "checkout-submit-panel",
      source: {
        file: "src/features/checkout/CheckoutSubmitPanel.tsx",
        line: 31,
        symbol: "onClick",
      },
      implementationSource: {
        file: "src/features/checkout/CheckoutSubmitPanel.tsx",
        line: 8,
        symbol: "handleSubmit",
      },
      touchesState: ["checkout-is-submitting-state"],
      triggersHooks: [],
      network: ["inline handler network call", "/api/checkout"],
    },
  ],
  ui: [
    {
      id: "checkout-submit-button",
      label: "Submit order",
      role: "button",
      componentId: "checkout-submit-panel",
      actionId: "checkout-submit-action",
      stateIds: ["checkout-is-submitting-state"],
      source: {
        file: "src/features/checkout/CheckoutSubmitPanel.tsx",
        line: 30,
        symbol: "<button>",
      },
    },
  ],
  remoteData: [
    {
      id: "checkout-submit-request",
      ownerComponentId: "checkout-submit-panel",
      kind: "fetch",
      key: ["checkout", "submit"],
      endpoint: "/api/checkout",
      source: {
        file: "src/features/checkout/CheckoutSubmitPanel.tsx",
        line: 13,
        symbol: "fetch",
      },
      risk: "high",
      note:
        "Checkout submit mutates server state; guard the handler while a submit request is pending.",
    },
  ],
  cacheOperations: [],
  formFields: [],
  designSystemUsages: [],
  props: [
    {
      id: "checkout-submit-button-disabled-prop",
      ownerComponentId: "checkout-submit-panel",
      targetComponentId: "checkout-submit-panel",
      propName: "disabled",
      kind: "value",
      value: "isSubmitting",
      references: ["isSubmitting"],
      source: {
        file: "src/features/checkout/CheckoutSubmitPanel.tsx",
        line: 30,
        symbol: "disabled",
      },
      note:
        "The disabled prop is display/control evidence; the submit guard still belongs in handleSubmit.",
    },
  ],
  contextUsages: [],
  externalStoreUsages: [],
  reduxActionUsages: [],
  reduxSelectorUsages: [],
};

const missingEffectCleanupGraph: YomiGraph = {
  components: [
    {
      id: "viewport-tracker-panel",
      name: "ViewportTrackerPanel",
      role: "component",
      runtime: "unknown",
      source: {
        file: "src/features/viewport/ViewportTrackerPanel.tsx",
        line: 5,
        symbol: "ViewportTrackerPanel",
      },
      ownsState: ["viewport-tracking-enabled-state"],
      usesHooks: ["viewport-tracker-effect"],
      renders: ["viewport-status"],
    },
    {
      id: "viewport-status",
      name: "ViewportStatus",
      role: "component",
      runtime: "unknown",
      source: {
        file: "src/features/viewport/ViewportStatus.tsx",
        line: 3,
        symbol: "ViewportStatus",
      },
      ownsState: [],
      usesHooks: [],
      renders: [],
    },
  ],
  renderEdges: [
    {
      id: "viewport-tracker-panel-renders-viewport-status",
      ownerComponentId: "viewport-tracker-panel",
      childComponentId: "viewport-status",
      kind: "render",
      source: {
        file: "src/features/viewport/ViewportTrackerPanel.tsx",
        line: 29,
        symbol: "ViewportStatus",
      },
      note: "ViewportTrackerPanel renders ViewportStatus as display-only evidence.",
    },
  ],
  states: [
    {
      id: "viewport-tracking-enabled-state",
      name: "trackingEnabled",
      ownerComponentId: "viewport-tracker-panel",
      kind: "local",
      source: {
        file: "src/features/viewport/ViewportTrackerPanel.tsx",
        line: 6,
        symbol: "trackingEnabled",
      },
    },
  ],
  hooks: [
    {
      id: "viewport-tracker-effect",
      name: "useEffect",
      ownerComponentId: "viewport-tracker-panel",
      kind: "effect",
      dependencies: ["trackingEnabled"],
      cleanup: {
        kind: "missing-cleanup-risk",
        resources: ["addEventListener"],
        source: {
          file: "src/features/viewport/ViewportTrackerPanel.tsx",
          line: 8,
          symbol: "useEffect",
        },
        note:
          "Effect allocates a resize listener but does not return a cleanup function.",
      },
      source: {
        file: "src/features/viewport/ViewportTrackerPanel.tsx",
        line: 8,
        symbol: "useEffect",
      },
      risk: "high",
      note:
        "Effect attaches a resize listener when tracking is enabled; verify teardown before editing display-only UI.",
    },
  ],
  actions: [
    {
      id: "viewport-tracker-enable-action",
      name: "enable viewport tracking",
      ownerComponentId: "viewport-tracker-panel",
      source: {
        file: "src/features/viewport/ViewportTrackerPanel.tsx",
        line: 25,
        symbol: "onClick",
      },
      touchesState: ["viewport-tracking-enabled-state"],
      triggersHooks: ["viewport-tracker-effect"],
      network: [],
    },
  ],
  ui: [
    {
      id: "viewport-tracker-enable-button",
      label: "Enable viewport tracking",
      role: "button",
      componentId: "viewport-tracker-panel",
      actionId: "viewport-tracker-enable-action",
      stateIds: ["viewport-tracking-enabled-state"],
      source: {
        file: "src/features/viewport/ViewportTrackerPanel.tsx",
        line: 22,
        symbol: "<button>",
      },
    },
  ],
  remoteData: [],
  cacheOperations: [],
  formFields: [],
  designSystemUsages: [],
  props: [
    {
      id: "viewport-tracker-panel-passes-enabled-prop",
      ownerComponentId: "viewport-tracker-panel",
      targetComponentId: "viewport-status",
      propName: "enabled",
      kind: "value",
      value: "trackingEnabled",
      references: ["trackingEnabled"],
      source: {
        file: "src/features/viewport/ViewportTrackerPanel.tsx",
        line: 29,
        symbol: "enabled",
      },
      note: "ViewportTrackerPanel passes trackingEnabled to ViewportStatus for display.",
    },
  ],
  contextUsages: [],
  externalStoreUsages: [],
  reduxActionUsages: [],
  reduxSelectorUsages: [],
};

async function readGraphForScenario(input: {
  readonly graphPath: string;
  readonly projectPath: string;
  readonly scenario: { readonly editTarget?: SourceLocation; readonly name: string };
}): Promise<YomiGraph | undefined> {
  try {
    return await readGraph({
      graphPath: input.graphPath,
      projectPath: input.projectPath,
    });
  } catch (error) {
    if (input.scenario.editTarget === undefined) {
      throw error;
    }
    return undefined;
  }
}

export function explainLastFailure(): ExplainResult {
  const repairBrief = getRepairBriefFromUi(demoGraph, "Customer search");
  const likelyEditTarget = repairBrief.nodes.find(
    (node) => node.label === "likely edit target",
  );

  return {
    issue: "stale-response",
    summary:
      "Yomi found a stale async response path from SearchInput.onChange through useEffect(query) to setSelectedCustomer.",
    observedBug: 'Search input says "grace" but rendered customer is Ada Lovelace.',
    editTarget: likelyEditTarget?.source ?? {
      file: "src/features/customers/CustomerSearchPanel.tsx",
      line: 42,
      symbol: "useEffect",
    },
    doNotStartFrom: [
      {
        source: {
          file: "src/features/customers/CustomerCard.tsx",
          line: 18,
          symbol: "CustomerCard",
        },
        reason:
          "CustomerCard renders selectedCustomer but does not own the fetch, request ordering, or state commit.",
      },
    ],
    suggestedFixShape:
      "Add AbortController, request versioning, or an ignore-stale guard before setSelectedCustomer.",
    repairBrief,
    nextCommands: [
      "yomi query brief-from-ui \"Customer search\"",
      "yomi query action-path edit-query-action",
      "yomi query effects-triggered-by query",
      "yomi verify stale-response",
    ],
  };
}
export function runBenchmark(input: RunBenchmarkInput): BenchmarkResult {
  if (input.benchmark !== "react-repair") {
    throw new Error(
      `Unknown benchmark "${input.benchmark}". Expected react-repair.`,
    );
  }

  return runReactRepairBenchmark({
    projectPath: input.projectPath ?? reactRepairFixturePath,
  });
}

export function listExamples(input: { readonly catalog: string }): ExamplesResult {
  if (input.catalog !== "react-repair") {
    throw new Error(`Unknown examples catalog "${input.catalog}". Expected react-repair.`);
  }

  const examples = listReactRepairExamples();
  const mustPass = examples.filter((example) => example.expectation === "must-pass").length;
  const knownLimits = examples.filter((example) => example.expectation === "known-limit").length;

  return {
    catalog: "react-repair",
    project: reactRepairFixturePath,
    summary: `${examples.length} React repair example(s): ${mustPass} must-pass, ${knownLimits} known-limit.`,
    examples,
  };
}

export async function runConceptDoctor(input: RunDoctorInput): Promise<DoctorResult> {
  const graph = await readGraph({
    graphPath: input.graphPath,
    projectPath: input.projectPath,
  });
  return runDoctor({
    graph,
    target: input.target,
  });
}

export async function runInstrument(
  input: RunInstrumentInput,
): Promise<InstrumentationResult> {
  const graph = await readGraph({
    graphPath: input.graphPath,
    projectPath: input.projectPath,
  });
  return instrumentProject({
    adapterImport: input.adapterImport,
    apply: input.apply,
    graph,
    projectPath: input.projectPath,
    queryAdapterImport: input.queryAdapterImport,
    target: input.target,
    targets: input.targets,
  });
}

export async function runTracePlanFromGraph(input: RunTracePlanInput): Promise<TracePlanResult> {
  const graph = await readGraph({
    graphPath: input.graphPath,
    projectPath: input.projectPath,
  });
  return runTracePlan({
    graph,
    scenarioFile: input.scenarioFile,
    target: input.target,
    url: input.url,
  });
}

export function writeJson<T>(data: T): void {
  process.stdout.write(`${JSON.stringify({ ok: true, data } satisfies CliOutput<T>, null, 2)}\n`);
}

export function writeJsonError(error: unknown): void {
  const errorObject = normalizeError(error);
  process.stdout.write(`${JSON.stringify({ ok: false, error: errorObject } satisfies CliErrorOutput, null, 2)}\n`);
}

function normalizeError(error: unknown): CliErrorOutput["error"] {
  if (error instanceof Error) {
    const code = getErrorCode(error);
    return {
      name: error.name,
      message: error.message,
      ...(code === undefined ? {} : { code }),
    };
  }

  return {
    name: "Error",
    message: typeof error === "string" ? error : "Unknown CLI error.",
  };
}

function getErrorCode(error: Error): string | undefined {
  const candidate = (error as { readonly code?: unknown }).code;
  return typeof candidate === "string" ? candidate : undefined;
}

function summarizeGraph(graph: YomiGraph): IndexResult["summary"] {
  return {
    components: graph.components.length,
    uiNodes: graph.ui.length,
    states: graph.states.length,
    hooks: graph.hooks.length,
    actions: graph.actions.length,
    remoteData: graph.remoteData.length,
    cacheOperations: graph.cacheOperations.length,
    formFields: graph.formFields.length,
    designSystemUsages: (graph.designSystemUsages ?? []).length,
    props: (graph.props ?? []).length,
    contextUsages: (graph.contextUsages ?? []).length,
    externalStoreUsages: (graph.externalStoreUsages ?? []).length,
    reduxActionUsages: (graph.reduxActionUsages ?? []).length,
    reduxSelectorUsages: (graph.reduxSelectorUsages ?? []).length,
  };
}

function createIndexCacheStore(projectRoot: string) {
  return createStore({
    dirPath: resolve(projectRoot, ".yomi"),
    name: "index-cache",
    fields: {
      fingerprint: { type: "string", default: "" },
      graphJson: { type: "string", default: "" },
      graphPath: { type: "string", default: "" },
      indexedAt: { type: "string", default: "" },
      projectRoot: { type: "string", default: "" },
      version: { type: "string", default: "" },
    },
  });
}

function indexCacheStorePath(projectRoot: string): string {
  return resolve(projectRoot, ".yomi/index-cache.json");
}

async function fingerprintProject(projectRoot: string): Promise<string> {
  const hash = createHash("sha256");
  const files = await collectFingerprintFiles(projectRoot);

  for (const filePath of files) {
    const relativePath = relative(projectRoot, filePath);
    const contents = await readFingerprintFile(filePath);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(contents);
    hash.update("\0");
  }

  return hash.digest("hex");
}

async function readFingerprintFile(filePath: string): Promise<Buffer> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error(`Fingerprint path is not a file: ${filePath}`);
    }
    return await readFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const wrapped = new Error(`Failed to read fingerprint file ${filePath}: ${message}`);
    if (error instanceof Error) {
      const code = getErrorCode(error);
      if (code !== undefined) {
        (wrapped as NodeJS.ErrnoException).code = code;
      }
    }
    throw wrapped;
  }
}

async function collectFingerprintFiles(projectRoot: string): Promise<readonly string[]> {
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = resolve(directory, entry.name);
      const relativePath = relative(projectRoot, entryPath);
      if (shouldIgnoreFingerprintPath(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (shouldFingerprintFile(entryPath)) {
        files.push(entryPath);
      }
    }
  }

  const rootStat = await stat(projectRoot);
  if (!rootStat.isDirectory()) {
    throw new Error(`Project path is not a directory: ${projectRoot}`);
  }

  await visit(projectRoot);
  return files.sort();
}

function shouldIgnoreFingerprintPath(relativePath: string): boolean {
  return (
    relativePath === "node_modules" ||
    relativePath.startsWith("node_modules/") ||
    relativePath === "dist" ||
    relativePath.startsWith("dist/") ||
    relativePath === "build" ||
    relativePath.startsWith("build/") ||
    relativePath === "out" ||
    relativePath.startsWith("out/") ||
    relativePath === "coverage" ||
    relativePath.startsWith("coverage/") ||
    relativePath === ".next" ||
    relativePath.startsWith(".next/") ||
    relativePath === ".turbo" ||
    relativePath.startsWith(".turbo/") ||
    relativePath === ".crust" ||
    relativePath.startsWith(".crust/") ||
    relativePath === ".git" ||
    relativePath.startsWith(".git/") ||
    relativePath === ".yomi" ||
    relativePath.startsWith(".yomi/")
  );
}

function shouldFingerprintFile(filePath: string): boolean {
  return /\.(tsx|jsx|ts|js|json)$/.test(filePath);
}
