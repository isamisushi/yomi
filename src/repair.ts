import { getRepairBriefFromUi, type QueryResult, type SourceLocation, type YomiGraph } from "./yomi-ir";

export type RepairResult = {
  readonly uiTarget: string;
  readonly status: "resolved";
  readonly summary: string;
  readonly confidence: {
    readonly level: "high" | "medium" | "low";
    readonly reasons: readonly string[];
  };
  readonly editTarget: SourceLocation;
  readonly whyEditTarget: string;
  readonly evidenceTrail: readonly RepairEvidence[];
  readonly doNotStartFrom: readonly {
    readonly source: SourceLocation;
    readonly reason: string;
  }[];
  readonly suggestedFixShape: string;
  readonly repairBrief: QueryResult;
  readonly nextCommands: readonly string[];
  readonly verificationPlan: readonly string[];
};

export type RepairEvidence = {
  readonly role:
    | "visible-surface"
    | "behavior-owner"
    | "state-transition"
    | "side-effect"
    | "data-cache"
    | "form-ownership"
    | "store-ownership"
    | "context-boundary"
    | "display-evidence"
    | "verification-risk";
  readonly label: string;
  readonly detail: string;
  readonly source: SourceLocation;
};

export function runRepair(input: {
  readonly graph: YomiGraph;
  readonly scenarioFile?: string;
  readonly target: string;
  readonly url?: string;
}): RepairResult {
  const repairBrief = getRepairBriefFromUi(input.graph, input.target);
  const likelyEditTarget = repairBrief.nodes.find(
    (node) => node.label === "likely edit target",
  );
  const editTarget = likelyEditTarget?.source ?? repairBrief.nodes.at(-1)?.source;

  if (editTarget === undefined) {
    throw new Error(`No repair context found for visible UI target "${input.target}".`);
  }
  const actionId = getActionIdFromRepairBrief(repairBrief);
  const evidenceTrail = collectEvidenceTrail(repairBrief, editTarget);

  return {
    uiTarget: input.target,
    status: "resolved",
    summary: `${repairBrief.summary} Start at ${formatSourceLocation(editTarget)}.`,
    confidence: inferConfidence(repairBrief, evidenceTrail),
    editTarget,
    whyEditTarget: explainEditTarget(editTarget, evidenceTrail),
    evidenceTrail,
    doNotStartFrom: collectDoNotStartFrom(repairBrief, editTarget),
    suggestedFixShape: inferSuggestedFixShape(repairBrief),
    repairBrief,
    nextCommands: getNextCommands(input, actionId),
    verificationPlan: getVerificationPlan(input),
  };
}

function getNextCommands(
  input: {
    readonly scenarioFile?: string;
    readonly target: string;
    readonly url?: string;
  },
  actionId: string | undefined,
): readonly string[] {
  return [
    `yomi query brief-from-ui ${JSON.stringify(input.target)}`,
    ...(actionId === undefined
      ? []
      : [
          `yomi query action-path ${JSON.stringify(actionId)}`,
          `yomi query data-path ${JSON.stringify(actionId)}`,
        ]),
    getVerifyCommand(input),
  ];
}

function getVerifyCommand(input: {
  readonly scenarioFile?: string;
  readonly url?: string;
}): string {
  if (input.scenarioFile === undefined) {
    return "yomi verify <scenario> --scenarioFile <path> --url <url>";
  }

  return [
    "yomi verify browser-scenario",
    `--scenarioFile ${JSON.stringify(input.scenarioFile)}`,
    ...(input.url === undefined ? [] : [`--url ${JSON.stringify(input.url)}`]),
  ].join(" ");
}

function getVerificationPlan(input: {
  readonly scenarioFile?: string;
  readonly url?: string;
}): readonly string[] {
  return [
    "Index or re-index the project after the source change.",
    input.scenarioFile === undefined
      ? "Run the browser scenario that reproduces the visible UI symptom."
      : `Run ${getVerifyCommand(input)} after the source change.`,
    "Confirm the verifier trace no longer contains a source-linked violation for this UI path.",
  ];
}

function collectEvidenceTrail(
  repairBrief: QueryResult,
  editTarget: SourceLocation,
): readonly RepairEvidence[] {
  const seen = new Set<string>();
  return repairBrief.nodes.flatMap((node) => {
    const role = classifyEvidenceRole(node.label, node.source, editTarget);
    if (role === undefined) {
      return [];
    }

    const key = `${role}:${node.label}:${formatSourceLocation(node.source)}`;
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);

    return [
      {
        role,
        label: node.label,
        detail: node.detail,
        source: node.source,
      },
    ];
  });
}

function classifyEvidenceRole(
  label: string,
  source: SourceLocation,
  editTarget: SourceLocation,
): RepairEvidence["role"] | undefined {
  if (label.startsWith("effect cleanup")) {
    return "verification-risk";
  }
  if (sameSourceLocation(source, editTarget) || label === "likely edit target") {
    return "behavior-owner";
  }
  if (label.startsWith("ui: ")) {
    return "visible-surface";
  }
  if (label.startsWith("state touched:")) {
    return "state-transition";
  }
  if (label.startsWith("effect/hook:")) {
    return "side-effect";
  }
  if (label.startsWith("data path:")) {
    return "data-cache";
  }
  if (label.startsWith("form ")) {
    return "form-ownership";
  }
  if (
    label.startsWith("external store:") ||
    label.startsWith("redux action:") ||
    label.startsWith("redux selector:")
  ) {
    return "store-ownership";
  }
  if (
    label.startsWith("route segment:") ||
    label.startsWith("server/client boundary:") ||
    label.startsWith("suspense boundary:") ||
    label.startsWith("context:")
  ) {
    return "context-boundary";
  }
  if (isSurfaceEvidenceNode(label)) {
    return "display-evidence";
  }
  return undefined;
}

function inferConfidence(
  repairBrief: QueryResult,
  evidenceTrail: readonly RepairEvidence[],
): RepairResult["confidence"] {
  const hasLikelyEditTarget = repairBrief.nodes.some((node) => node.label === "likely edit target");
  const hasVisibleSurface = evidenceTrail.some((entry) => entry.role === "visible-surface");
  const hasBehaviorPath = evidenceTrail.some((entry) =>
    [
      "behavior-owner",
      "state-transition",
      "side-effect",
      "data-cache",
      "form-ownership",
      "store-ownership",
    ].includes(entry.role),
  );
  const hasDisplayEvidence = evidenceTrail.some((entry) => entry.role === "display-evidence");
  const reasons = [
    ...(hasLikelyEditTarget ? ["repair brief contains a likely edit target"] : []),
    ...(hasVisibleSurface ? ["visible UI surface is linked to source"] : []),
    ...(hasBehaviorPath ? ["state/effect/data/store ownership evidence is present"] : []),
    ...(hasDisplayEvidence ? ["display-only evidence is separated from the edit target"] : []),
  ];

  if (hasLikelyEditTarget && hasVisibleSurface && hasBehaviorPath) {
    return { level: "high", reasons };
  }
  if (hasLikelyEditTarget && hasBehaviorPath) {
    return { level: "medium", reasons };
  }
  return {
    level: "low",
    reasons:
      reasons.length === 0
        ? ["repair brief has insufficient source-linked ownership evidence"]
        : reasons,
  };
}

function explainEditTarget(
  editTarget: SourceLocation,
  evidenceTrail: readonly RepairEvidence[],
): string {
  const roleSummary = unique(
    evidenceTrail
      .filter((entry) => entry.role !== "display-evidence")
      .map((entry) => entry.role),
  ).join(", ");

  return [
    `Start at ${formatSourceLocation(editTarget)} because it is the source-linked behavior owner for this visible UI path.`,
    roleSummary.length === 0
      ? "The repair brief has no additional ownership evidence; inspect the graph before editing."
      : `Supporting evidence roles: ${roleSummary}.`,
    "Treat display-only surfaces as evidence unless source inspection proves the graph is stale.",
  ].join(" ");
}

function getActionIdFromRepairBrief(repairBrief: QueryResult): string | undefined {
  const uiNode = repairBrief.nodes.find((node) => node.label.startsWith("ui: "));
  const actionMatch = /(?:^|; )action:([^;]+)/.exec(uiNode?.detail ?? "");
  return actionMatch?.[1];
}

function collectDoNotStartFrom(
  repairBrief: QueryResult,
  editTarget: SourceLocation,
): RepairResult["doNotStartFrom"] {
  const seen = new Set<string>();
  return repairBrief.nodes
    .filter((node) => isSurfaceEvidenceNode(node.label))
    .filter((node) => !sameSourceLocation(node.source, editTarget))
    .flatMap((node) => {
      const key = formatSourceLocation(node.source);
      if (seen.has(key)) {
        return [];
      }
      seen.add(key);
      return [
        {
          source: node.source,
          reason: `${node.label} is evidence for the visible surface, but the likely behavior owner is ${formatSourceLocation(editTarget)}.`,
        },
      ];
    });
}

function isSurfaceEvidenceNode(label: string): boolean {
  return (
    label.startsWith("ui: ") ||
    label.startsWith("design-system: ") ||
    label.startsWith("prop: ")
  );
}

function sameSourceLocation(left: SourceLocation, right: SourceLocation): boolean {
  return (
    left.file === right.file &&
    left.line === right.line &&
    left.symbol === right.symbol
  );
}

function inferSuggestedFixShape(repairBrief: QueryResult): string {
  const labels = repairBrief.nodes.map((node) => node.label);
  if (labels.some((label) => label.startsWith("form field:"))) {
    return "Fix the field registration, validation rule, controlled field binding, or error ownership that backs the visible form issue.";
  }
  if (
    repairBrief.nodes.some(
      (node) =>
        node.label.startsWith("effect/hook:") &&
        /\bshared hook\b|\bused by\b|\bconsumer\b/i.test(node.detail),
    )
  ) {
    return "Fix the shared hook implementation while preserving the behavior of every visible consumer in the repair brief.";
  }
  const likelyEditTarget = repairBrief.nodes.find((node) => node.label === "likely edit target");
  const keyIsRemountEditTarget = repairBrief.nodes.some(
    (node) =>
      node.label === "prop: key" &&
      likelyEditTarget !== undefined &&
      sameSourceLocation(node.source, likelyEditTarget.source) &&
      /\b(remount|remounts|remounted|state loss)\b/i.test(node.detail),
  );
  if (keyIsRemountEditTarget) {
    return "Fix the parent key identity or remount boundary that owns the child component's local state lifetime.";
  }
  const propRenameEditTarget = repairBrief.nodes.some(
    (node) =>
      node.label.startsWith("prop: ") &&
      likelyEditTarget !== undefined &&
      sameSourceLocation(node.source, likelyEditTarget.source) &&
      /\b(prop rename|renamed prop|prop contract|prop mismatch|reads [A-Za-z0-9_$]+)\b/i.test(
        node.detail,
      ),
  );
  if (propRenameEditTarget) {
    return "Fix the parent/child prop contract at the source-linked boundary before editing the child display markup.";
  }
  if (labels.some((label) => label.startsWith("external store:"))) {
    return "Fix the external store or atom read/write owner before editing display-only UI.";
  }
  if (labels.some((label) => label.startsWith("redux action:"))) {
    return "Fix the Redux action or reducer owner before editing display-only UI.";
  }
  if (labels.some((label) => label === "effect/hook: server action")) {
    return "Fix the Server Action and matching revalidation path before editing client-only display components.";
  }
  if (labels.some((label) => label.startsWith("effect/hook:"))) {
    return "Fix the effect, cleanup, async ordering, or state commit path that owns the visible behavior.";
  }
  if (labels.some((label) => label.startsWith("data path: cache:"))) {
    return "Fix the cache operation, key, invalidation target, or mutation callback that owns the stale visible data.";
  }
  return "Start at the source-linked behavior owner and keep display-only surfaces as evidence, not primary edit targets.";
}

function formatSourceLocation(source: SourceLocation): string {
  return `${source.file}:${source.line} ${source.symbol}`;
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}
