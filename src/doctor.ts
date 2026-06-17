import { runRepair, type RepairResult } from "./repair";
import { runStaleResponseVerification } from "./runtime-verifier";
import {
  getRepairBriefFromUi,
  type SourceLocation,
  type YomiGraph,
} from "./yomi-ir";

export type DoctorResult = {
  readonly status: "failed" | "passed";
  readonly summary: string;
  readonly checks: readonly DoctorCheck[];
  readonly nextCommands: readonly string[];
  readonly repairTargets: readonly DoctorRepairTarget[];
};

export type DoctorCheck = {
  readonly id: string;
  readonly status: "failed" | "passed";
  readonly summary: string;
  readonly evidence: readonly string[];
};

export type DoctorRepairTarget = {
  readonly uiTarget: string;
  readonly status: "failed" | "passed";
  readonly editTarget?: SourceLocation;
  readonly confidence?: RepairResult["confidence"];
  readonly missing: readonly string[];
};

export function runDoctor(input: {
  readonly graph: YomiGraph;
  readonly target?: string;
}): DoctorResult {
  const repairTargets = getRepairTargets(input.graph, input.target);
  const repairTargetResults = repairTargets.map((target) =>
    evaluateRepairTarget(input.graph, target),
  );
  const checks = [
    checkSourceLinkedGraph(input.graph),
    checkShortAgentQueries(input.graph, repairTargets),
    checkRepairContract(repairTargetResults),
    checkRuntimeTraceJoin(),
  ];
  const failed = checks.filter((check) => check.status === "failed").length;

  return {
    status: failed === 0 ? "passed" : "failed",
    summary:
      failed === 0
        ? `Yomi concept contract passed for ${repairTargetResults.length} repair target(s).`
        : `Yomi concept contract failed ${failed}/${checks.length} check(s).`,
    checks,
    nextCommands: getDoctorNextCommands({
      checks,
      repairTargets: repairTargetResults,
      requestedTarget: input.target,
    }),
    repairTargets: repairTargetResults,
  };
}

function getDoctorNextCommands(input: {
  readonly checks: readonly DoctorCheck[];
  readonly repairTargets: readonly DoctorRepairTarget[];
  readonly requestedTarget?: string;
}): readonly string[] {
  const failedCheckIds = new Set(
    input.checks
      .filter((check) => check.status === "failed")
      .map((check) => check.id),
  );
  if (failedCheckIds.size === 0) {
    return [
      ...input.repairTargets.slice(0, 3).map((target) =>
        `yomi repair ${JSON.stringify(target.uiTarget)}`
      ),
      "yomi benchmark react-repair",
    ];
  }

  const target = input.requestedTarget ?? input.repairTargets[0]?.uiTarget;
  return unique([
    ...(failedCheckIds.has("source-linked-graph") ? ["yomi index --force"] : []),
    ...(target === undefined
      ? ["yomi query find-ui-node <visible-ui-label>"]
      : [
          `yomi query brief-from-ui ${JSON.stringify(target)}`,
          `yomi repair ${JSON.stringify(target)}`,
        ]),
    ...(failedCheckIds.has("runtime-trace-join") ? ["yomi verify stale-response"] : []),
    "yomi doctor",
  ]);
}

function getRepairTargets(
  graph: YomiGraph,
  target: string | undefined,
): readonly string[] {
  if (target !== undefined && target !== "") {
    return [target];
  }

  return [...new Set(graph.ui.flatMap((node) => node.actionId === undefined ? [] : [node.label]))];
}

function checkSourceLinkedGraph(graph: YomiGraph): DoctorCheck {
  const missing = [
    graph.components.length === 0 ? "components" : undefined,
    graph.ui.length === 0 ? "ui" : undefined,
    graph.actions.length === 0 ? "actions" : undefined,
  ].filter((field): field is string => field !== undefined);
  const sourceProblems = [
    ...graph.components.map((node) => [`component:${node.id}`, node.source] as const),
    ...graph.ui.map((node) => [`ui:${node.id}`, node.source] as const),
    ...graph.actions.map((node) => [`action:${node.id}`, node.source] as const),
  ].flatMap(([id, source]) => hasSourceLocation(source) ? [] : [id]);

  return {
    id: "source-linked-graph",
    status: missing.length === 0 && sourceProblems.length === 0 ? "passed" : "failed",
    summary:
      "Graph exposes source-linked React components, visible UI nodes, and actions.",
    evidence: [
      `components:${graph.components.length}`,
      `ui:${graph.ui.length}`,
      `actions:${graph.actions.length}`,
      ...(missing.length === 0 ? [] : [`missing:${missing.join(",")}`]),
      ...(sourceProblems.length === 0 ? [] : [`sourceProblems:${sourceProblems.join(",")}`]),
    ],
  };
}

function checkShortAgentQueries(
  graph: YomiGraph,
  targets: readonly string[],
): DoctorCheck {
  const queryResults = targets.slice(0, 10).map((target) => getRepairBriefFromUi(graph, target));
  const largeResults = queryResults.filter((result) => result.nodes.length > 30);
  const sourceProblems = queryResults.flatMap((result) =>
    result.nodes.flatMap((node) => hasSourceLocation(node.source) ? [] : [`${result.query}:${node.label}`]),
  );

  return {
    id: "short-agent-queries",
    status: largeResults.length === 0 && sourceProblems.length === 0 ? "passed" : "failed",
    summary:
      "Repair queries stay compact and source-linked instead of returning graph dumps.",
    evidence: [
      `sampledQueries:${queryResults.length}`,
      `maxNodes:${Math.max(0, ...queryResults.map((result) => result.nodes.length))}`,
      ...(largeResults.length === 0
        ? []
        : [`tooLarge:${largeResults.map((result) => result.query).join(",")}`]),
      ...(sourceProblems.length === 0
        ? []
        : [`sourceProblems:${sourceProblems.join(",")}`]),
    ],
  };
}

function checkRepairContract(targets: readonly DoctorRepairTarget[]): DoctorCheck {
  const failedTargets = targets.filter((target) => target.status === "failed");

  return {
    id: "repair-contract",
    status: targets.length > 0 && failedTargets.length === 0 ? "passed" : "failed",
    summary:
      "Visible UI targets resolve to an agent-ready edit contract with behavior-owner evidence.",
    evidence: [
      `targets:${targets.length}`,
      `failed:${failedTargets.length}`,
      ...failedTargets.map((target) => `${target.uiTarget}:${target.missing.join(",")}`),
    ],
  };
}

function evaluateRepairTarget(graph: YomiGraph, target: string): DoctorRepairTarget {
  try {
    const repair = runRepair({ graph, target });
    const missing = getMissingRepairFields(repair);
    return {
      uiTarget: target,
      status: missing.length === 0 ? "passed" : "failed",
      editTarget: repair.editTarget,
      confidence: repair.confidence,
      missing,
    };
  } catch (error) {
    return {
      uiTarget: target,
      status: "failed",
      missing: [error instanceof Error ? error.message : "unknown repair failure"],
    };
  }
}

function getMissingRepairFields(repair: RepairResult): readonly string[] {
  const evidenceRoles = new Set(repair.evidenceTrail.map((entry) => entry.role));
  return [
    repair.confidence.level === "low" ? "confidence" : undefined,
    repair.whyEditTarget === "" ? "whyEditTarget" : undefined,
    evidenceRoles.has("visible-surface") ? undefined : "visible-surface evidence",
    evidenceRoles.has("behavior-owner") ? undefined : "behavior-owner evidence",
    repair.doNotStartFrom.length === 0 ? "doNotStartFrom" : undefined,
    repair.suggestedFixShape === "" ? "suggestedFixShape" : undefined,
    repair.nextCommands.length === 0 ? "nextCommands" : undefined,
    repair.verificationPlan.length === 0 ? "verificationPlan" : undefined,
  ].filter((field): field is string => field !== undefined);
}

function checkRuntimeTraceJoin(): DoctorCheck {
  const result = runStaleResponseVerification("broken");
  const sourceLinkedEvents = result.trace.filter((event) => event.source !== undefined);
  const hasViolation = result.trace.some(
    (event) => event.kind === "violation-detected" && event.source !== undefined,
  );

  return {
    id: "runtime-trace-join",
    status: result.status === "failed" && hasViolation ? "passed" : "failed",
    summary:
      "Runtime verifier produces source-linked pass/fail trace events for temporal UI bugs.",
    evidence: [
      "scenario:stale-response",
      `status:${result.status}`,
      `traceEvents:${result.trace.length}`,
      `sourceLinked:${sourceLinkedEvents.length}`,
      `sourceLinkedViolation:${hasViolation}`,
    ],
  };
}

function hasSourceLocation(source: SourceLocation): boolean {
  return source.file !== "" && source.symbol !== "" && Number.isFinite(source.line) && source.line > 0;
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}
