import { runRepair, type RepairResult } from "./repair";
import type { SourceLocation, YomiGraph } from "./yomi-ir";

export type TracePlanBugType =
  | "cache-invalidation"
  | "effect-cleanup"
  | "form-validation"
  | "prop-boundary"
  | "remount-state-loss"
  | "stale-response"
  | "state-effect-ordering"
  | "store-ownership"
  | "unknown";

export type TracePlanTargetKind =
  | "action"
  | "cache"
  | "component"
  | "effect"
  | "form"
  | "state"
  | "store";

export type TracePlanTarget = {
  readonly graphNodeId: string;
  readonly kind: TracePlanTargetKind;
  readonly reason: string;
  readonly source?: SourceLocation;
};

export type TracePlanResult = {
  readonly uiTarget: string;
  readonly bugType: TracePlanBugType;
  readonly summary: string;
  readonly recommendedTraceTargets: readonly TracePlanTarget[];
  readonly instrumentCommand?: string;
  readonly why: string;
  readonly repairPlan: RepairResult;
  readonly nextCommands: readonly string[];
};

export function runTracePlan(input: {
  readonly graph: YomiGraph;
  readonly scenarioFile?: string;
  readonly target: string;
  readonly url?: string;
}): TracePlanResult {
  const repairPlan = runRepair(input);
  const bugType = inferBugType(repairPlan);
  const recommendedTraceTargets = collectTraceTargets(input.graph, repairPlan, bugType);
  const instrumentCommand = getInstrumentCommand(recommendedTraceTargets);

  return {
    uiTarget: input.target,
    bugType,
    summary:
      recommendedTraceTargets.length === 0
        ? `No concrete instrumentation target was found for ${input.target}. Use the repair plan before adding manual traces.`
        : `Instrument ${recommendedTraceTargets.length} source-linked target(s) for ${input.target} before editing behavior.`,
    recommendedTraceTargets,
    ...(instrumentCommand === undefined ? {} : { instrumentCommand }),
    why: explainTracePlan(bugType, recommendedTraceTargets),
    repairPlan,
    nextCommands: [
      ...(instrumentCommand === undefined ? [] : [instrumentCommand]),
      ...repairPlan.nextCommands,
    ],
  };
}

function collectTraceTargets(
  graph: YomiGraph,
  repairPlan: RepairResult,
  bugType: TracePlanBugType,
): readonly TracePlanTarget[] {
  const targets: TracePlanTarget[] = [];
  const add = (target: TracePlanTarget): void => {
    if (targets.some((existing) => existing.graphNodeId === target.graphNodeId)) {
      return;
    }
    targets.push(target);
  };

  const visibleSurface = repairPlan.evidenceTrail.find(
    (evidence) => evidence.role === "visible-surface",
  );
  const actionId = extractDetailValue(visibleSurface?.detail, "action");
  const componentId = extractDetailValue(visibleSurface?.detail, "component");

  const action =
    actionId === undefined
      ? graph.actions.find((candidate) =>
          sameSourceLocation(candidate.source, repairPlan.editTarget) ||
          sameOptionalSourceLocation(candidate.implementationSource, repairPlan.editTarget)
        )
      : graph.actions.find((candidate) => candidate.id === actionId);
  if (action !== undefined) {
    add({
      graphNodeId: action.id,
      kind: "action",
      reason: "Trace the user action that starts this visible behavior path.",
      source: action.implementationSource ?? action.source,
    });
  }

  for (const evidence of repairPlan.evidenceTrail) {
    if (evidence.role === "side-effect" || evidence.role === "behavior-owner") {
      const hook = graph.hooks.find((candidate) =>
        sameSourceLocation(candidate.source, evidence.source),
      );
      if (hook !== undefined) {
        add({
          graphNodeId: hook.id,
          kind: hook.kind === "effect" ? "effect" : "state",
          reason:
            hook.kind === "effect"
              ? "Trace effect execution, dependency values, and cleanup ordering."
              : "Trace the hook that owns the behavior source.",
          source: hook.source,
        });
      }
    }

    if (evidence.role === "state-transition" || evidence.role === "behavior-owner") {
      const state = graph.states.find((candidate) =>
        sameSourceLocation(candidate.source, evidence.source),
      );
      if (state !== undefined) {
        add({
          graphNodeId: state.id,
          kind: "state",
          reason: "Trace state value history around the visible symptom.",
          source: state.source,
        });
      }
    }

    if (
      shouldTraceCacheTargets(bugType) &&
      (evidence.role === "data-cache" || evidence.role === "behavior-owner")
    ) {
      const cacheOperation = graph.cacheOperations.find((candidate) =>
        sameSourceLocation(candidate.source, evidence.source),
      );
      if (cacheOperation !== undefined) {
        add({
          graphNodeId: cacheOperation.id,
          kind: "cache",
          reason: "Trace cache mutation or invalidation against the visible stale data.",
          source: cacheOperation.source,
        });
      }
    }

    if (evidence.role === "form-ownership" || evidence.role === "behavior-owner") {
      const formField = graph.formFields.find((candidate) =>
        sameOptionalSourceLocation(candidate.register, evidence.source) ||
        sameOptionalSourceLocation(candidate.validation?.source, evidence.source) ||
        candidate.errors.some((error) => sameSourceLocation(error.source, evidence.source))
      );
      if (formField !== undefined) {
        add({
          graphNodeId: formField.id,
          kind: "form",
          reason: "Trace field registration, validation, and error ownership.",
          source: formField.validation?.source ?? formField.register,
        });
      }
    }

    if (evidence.role === "store-ownership" || evidence.role === "behavior-owner") {
      const storeTarget = findStoreTarget(graph, evidence.source);
      if (storeTarget !== undefined) {
        add(storeTarget);
      }
    }
  }

  const component =
    componentId === undefined
      ? graph.components.find((candidate) =>
          sameSourceLocation(candidate.source, repairPlan.editTarget),
        )
      : graph.components.find((candidate) => candidate.id === componentId);
  if (component !== undefined) {
    add({
      graphNodeId: component.id,
      kind: "component",
      reason: "Trace render/remount boundaries for the visible component.",
      source: component.source,
    });
  }

  return targets;
}

function findStoreTarget(
  graph: YomiGraph,
  source: SourceLocation,
): TracePlanTarget | undefined {
  const externalStoreUsage = graph.externalStoreUsages.find((usage) =>
    sameSourceLocation(usage.source, source) ||
    sameOptionalSourceLocation(usage.storeSource, source) ||
    usage.selectedSources.some((selectedSource) =>
      sameSourceLocation(selectedSource.source, source),
    )
  );
  if (externalStoreUsage !== undefined) {
    return {
      graphNodeId: externalStoreUsage.id,
      kind: "store",
      reason: "Trace external store reads and writes that own the visible value.",
      source: externalStoreUsage.source,
    };
  }

  const reduxActionUsage = graph.reduxActionUsages.find((usage) =>
    sameSourceLocation(usage.dispatchSource, source) ||
    sameOptionalSourceLocation(usage.actionSource, source) ||
    sameOptionalSourceLocation(usage.reducerSource, source)
  );
  if (reduxActionUsage !== undefined) {
    return {
      graphNodeId: reduxActionUsage.id,
      kind: "store",
      reason: "Trace the Redux dispatch/reducer ownership path.",
      source: reduxActionUsage.reducerSource ?? reduxActionUsage.dispatchSource,
    };
  }

  const reduxSelectorUsage = graph.reduxSelectorUsages.find((usage) =>
    sameSourceLocation(usage.source, source) ||
    sameOptionalSourceLocation(usage.selectedSource, source)
  );
  if (reduxSelectorUsage !== undefined) {
    return {
      graphNodeId: reduxSelectorUsage.id,
      kind: "store",
      reason: "Trace the Redux selector value used by the visible component.",
      source: reduxSelectorUsage.selectedSource ?? reduxSelectorUsage.source,
    };
  }

  return undefined;
}

function inferBugType(repairPlan: RepairResult): TracePlanBugType {
  const evidenceText = repairPlan.evidenceTrail
    .map((evidence) => `${evidence.label}\n${evidence.detail}`)
    .join("\n");

  if (repairPlan.evidenceTrail.some((evidence) => evidence.role === "form-ownership")) {
    return "form-validation";
  }
  if (repairPlan.evidenceTrail.some((evidence) => evidence.role === "store-ownership")) {
    return "store-ownership";
  }
  if (/\bcleanup\b/i.test(evidenceText)) {
    return "effect-cleanup";
  }
  if (/\b(remount|remounts|remounted|state loss)\b/i.test(evidenceText)) {
    return "remount-state-loss";
  }
  if (/\b(prop rename|renamed prop|prop contract|prop mismatch)\b/i.test(evidenceText)) {
    return "prop-boundary";
  }
  if (/\b(stale|response|request|fetch)\b/i.test(evidenceText)) {
    return "stale-response";
  }
  if (
    repairPlan.evidenceTrail.some((evidence) => evidence.role === "data-cache") ||
    /\b(cache|invalidate|invalidation|mutate|revalidate|query key)\b/i.test(
      repairPlan.suggestedFixShape,
    )
  ) {
    return "cache-invalidation";
  }
  if (
    repairPlan.evidenceTrail.some((evidence) => evidence.role === "side-effect") &&
    repairPlan.evidenceTrail.some((evidence) => evidence.role === "state-transition")
  ) {
    return "state-effect-ordering";
  }
  return "unknown";
}

function shouldTraceCacheTargets(bugType: TracePlanBugType): boolean {
  return bugType === "cache-invalidation";
}

function explainTracePlan(
  bugType: TracePlanBugType,
  targets: readonly TracePlanTarget[],
): string {
  if (targets.length === 0) {
    return "The graph has a repair plan but no target that Yomi can instrument directly; inspect the repair evidence before adding manual trace calls.";
  }

  const targetKinds = unique(targets.map((target) => target.kind)).join(", ");
  return `This is a ${bugType} trace plan. It keeps instrumentation on the smallest source-linked behavior path (${targetKinds}) so runtime history can confirm ordering before the agent edits code.`;
}

function getInstrumentCommand(targets: readonly TracePlanTarget[]): string | undefined {
  const [firstTarget, ...restTargets] = targets;
  if (firstTarget === undefined) {
    return undefined;
  }
  const targetFlag =
    restTargets.length === 0
      ? ""
      : ` --targets ${restTargets.map((target) => target.graphNodeId).join(",")}`;
  return `yomi instrument ${firstTarget.graphNodeId}${targetFlag}`;
}

function extractDetailValue(detail: string | undefined, key: string): string | undefined {
  const match = new RegExp(`(?:^|; )${key}:([^;]+)`).exec(detail ?? "");
  return match?.[1];
}

function sameOptionalSourceLocation(
  left: SourceLocation | undefined,
  right: SourceLocation,
): boolean {
  return left !== undefined && sameSourceLocation(left, right);
}

function sameSourceLocation(left: SourceLocation, right: SourceLocation): boolean {
  return (
    left.file === right.file &&
    left.line === right.line &&
    left.symbol === right.symbol
  );
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}
