import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Browser, Page } from "playwright";

import { runRepair, type RepairResult } from "./repair";
import {
  type QueryResult,
  type SourceLocation,
  type TraceEvent,
  type YomiGraph,
} from "./yomi-ir";

export type ScenarioObservationKind = "inputValue" | "textContent";

export type ScenarioStep =
  | {
      readonly kind: "open";
    }
  | {
      readonly kind: "clickByTestId";
      readonly testId: string;
    }
  | {
      readonly kind: "fillByTestId";
      readonly testId: string;
      readonly value: string;
    }
  | {
      readonly kind: "waitForTestId";
      readonly testId: string;
    };

export type ScenarioObservation = {
  readonly id: string;
  readonly kind: ScenarioObservationKind;
  readonly testId: string;
  readonly source?: SourceLocation;
  readonly graphNodeId?: string;
};

export type ScenarioAssertion = {
  readonly id: string;
  readonly actual: string;
  readonly equals: string;
  readonly source?: SourceLocation;
  readonly graphNodeId?: string;
  readonly message: string;
};

export type ScenarioRepairTarget = {
  readonly kind: "ui";
  readonly target: string;
};

export type ScenarioSourceHint = {
  readonly source: SourceLocation;
  readonly reason: string;
};

export type ScenarioViolation = {
  readonly id: string;
  readonly message: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly source?: SourceLocation;
  readonly graphNodeId?: string;
};

export type BrowserScenario = {
  readonly name: string;
  readonly url?: string;
  readonly steps: readonly ScenarioStep[];
  readonly observations: readonly ScenarioObservation[];
  readonly assertions: readonly ScenarioAssertion[];
  readonly repairTarget?: ScenarioRepairTarget;
  readonly editTarget?: SourceLocation;
  readonly doNotStartFrom?: readonly ScenarioSourceHint[];
  readonly suggestedFixShape?: string;
};

export type ScenarioVerificationResult = {
  readonly scenario: string;
  readonly status: "failed" | "passed";
  readonly summary: string;
  readonly editTarget: SourceLocation;
  readonly doNotStartFrom: readonly ScenarioSourceHint[];
  readonly suggestedFixShape: string;
  readonly confidence?: RepairResult["confidence"];
  readonly violations: readonly ScenarioViolation[];
  readonly repairBrief?: QueryResult;
  readonly repairPlan?: RepairResult;
  readonly trace: readonly TraceEvent[];
};

type ObservationValues = ReadonlyMap<string, string>;

type ScenarioRepairContext = {
  readonly editTarget: SourceLocation;
  readonly doNotStartFrom: readonly ScenarioSourceHint[];
  readonly suggestedFixShape: string;
  readonly confidence?: RepairResult["confidence"];
  readonly repairBrief?: QueryResult;
  readonly repairPlan?: RepairResult;
};

export async function readBrowserScenarioFile(input: {
  readonly path: string;
  readonly projectPath: string;
}): Promise<BrowserScenario> {
  const scenarioPath = resolve(input.projectPath, input.path);
  const raw = await readFile(scenarioPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return parseBrowserScenario(parsed, scenarioPath);
}

export function parseBrowserScenario(input: unknown, sourceName = "scenario"): BrowserScenario {
  const value = objectValue(input, sourceName);
  const scenario = {
    name: requiredString(value, "name", sourceName),
    url: optionalString(value, "url", sourceName),
    steps: requiredArray(value, "steps", sourceName).map((step, index) =>
      parseScenarioStep(step, `${sourceName}.steps[${index}]`),
    ),
    observations: requiredArray(value, "observations", sourceName).map((observation, index) =>
      parseScenarioObservation(observation, `${sourceName}.observations[${index}]`),
    ),
    assertions: requiredArray(value, "assertions", sourceName).map((assertion, index) =>
      parseScenarioAssertion(assertion, `${sourceName}.assertions[${index}]`),
    ),
    repairTarget: optionalRepairTarget(value, "repairTarget", sourceName),
    editTarget: optionalSourceLocation(value, "editTarget", sourceName),
    doNotStartFrom: optionalArray(value, "doNotStartFrom", sourceName).map((hint, index) =>
      parseSourceHint(hint, `${sourceName}.doNotStartFrom[${index}]`),
    ),
    suggestedFixShape: optionalString(value, "suggestedFixShape", sourceName),
  };
  if (scenario.repairTarget === undefined && scenario.editTarget === undefined) {
    throw new Error(`${sourceName}.repairTarget or ${sourceName}.editTarget is required.`);
  }
  return scenario;
}

export async function verifyBrowserScenario(input: {
  readonly graph?: YomiGraph;
  readonly scenario: BrowserScenario;
  readonly url?: string;
}): Promise<ScenarioVerificationResult> {
  const url = input.url ?? input.scenario.url;
  if (url === undefined) {
    throw new Error(
      `Scenario "${input.scenario.name}" needs a url in the scenario file or --url.`,
    );
  }

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await executeScenarioSteps({ page, scenario: input.scenario, url });
    const observations = await collectObservations(page, input.scenario.observations);
    const runtimeTrace = await collectRuntimeTrace(page);
    return evaluateScenario({
      graph: input.graph,
      runtimeTrace,
      scenario: input.scenario,
      observations,
    });
  } finally {
    await closeBrowser(browser);
  }
}

export function evaluateScenario(input: {
  readonly graph?: YomiGraph;
  readonly scenario: BrowserScenario;
  readonly observations: ObservationValues;
  readonly runtimeTrace?: readonly TraceEvent[];
}): ScenarioVerificationResult {
  const repairContext = resolveScenarioRepairContext({
    graph: input.graph,
    scenario: input.scenario,
  });
  const trace: TraceEvent[] = [
    ...(input.runtimeTrace ?? []),
    ...input.scenario.observations.map((observation) => ({
      id: `observe-${observation.id}`,
      at: "browser",
      kind: "render-committed" as const,
      summary: `${observation.id} observed as "${input.observations.get(observation.id) ?? ""}".`,
      source: observation.source,
      graphNodeId: observation.graphNodeId,
      correlationId: input.scenario.name,
    })),
  ];
  const failures = input.scenario.assertions.filter((assertion) => {
    const actual = input.observations.get(assertion.actual);
    return actual !== assertion.equals;
  });
  const violations = failures.map((assertion) => ({
    id: assertion.id,
    message: assertion.message,
    expected: assertion.equals,
    actual: input.observations.get(assertion.actual) ?? "",
    source: assertion.source,
    graphNodeId: assertion.graphNodeId,
  }));

  for (const assertion of input.scenario.assertions) {
    const actual = input.observations.get(assertion.actual) ?? "";
    trace.push({
      id: `assert-${assertion.id}`,
      at: "browser",
      kind: failures.includes(assertion) ? "violation-detected" : "response-resolved",
      summary: failures.includes(assertion)
        ? `${assertion.message} Expected "${assertion.equals}", received "${actual}".`
        : `${assertion.actual} matched "${assertion.equals}".`,
      source: assertion.source,
      graphNodeId: assertion.graphNodeId,
      correlationId: input.scenario.name,
    });
  }

  return {
    scenario: input.scenario.name,
    status: failures.length === 0 ? "passed" : "failed",
    summary:
      failures.length === 0
        ? `${input.scenario.name} passed ${input.scenario.assertions.length} assertion(s).`
        : `${input.scenario.name} failed ${failures.length}/${input.scenario.assertions.length} assertion(s).`,
    editTarget: repairContext.editTarget,
    doNotStartFrom: repairContext.doNotStartFrom,
    suggestedFixShape: repairContext.suggestedFixShape,
    confidence: repairContext.confidence,
    violations,
    repairBrief: repairContext.repairBrief,
    repairPlan: repairContext.repairPlan,
    trace,
  };
}

export function resolveScenarioRepairContext(input: {
  readonly graph?: YomiGraph;
  readonly scenario: BrowserScenario;
}): ScenarioRepairContext {
  if (input.scenario.repairTarget !== undefined) {
    if (input.graph === undefined) {
      if (input.scenario.editTarget === undefined) {
        throw new Error(
          `Scenario "${input.scenario.name}" repairTarget needs a Yomi graph or a fallback editTarget.`,
        );
      }
      return {
        editTarget: input.scenario.editTarget,
        doNotStartFrom: getScenarioDoNotStartFrom(input.scenario, input.scenario.editTarget),
        suggestedFixShape:
          input.scenario.suggestedFixShape ??
          "Inspect the graph-linked repair target before editing display-only components.",
      };
    }

    const repairPlan = runRepair({
      graph: input.graph,
      target: input.scenario.repairTarget.target,
    });

    return {
      editTarget: repairPlan.editTarget,
      doNotStartFrom: getScenarioDoNotStartFrom(input.scenario, repairPlan.editTarget),
      suggestedFixShape:
        input.scenario.suggestedFixShape ??
        repairPlan.suggestedFixShape,
      confidence: repairPlan.confidence,
      repairBrief: repairPlan.repairBrief,
      repairPlan,
    };
  }

  if (input.scenario.editTarget === undefined) {
    throw new Error(`Scenario "${input.scenario.name}" needs editTarget.`);
  }

  return {
    editTarget: input.scenario.editTarget,
    doNotStartFrom: getScenarioDoNotStartFrom(input.scenario, input.scenario.editTarget),
    suggestedFixShape:
      input.scenario.suggestedFixShape ??
      "Inspect the listed edit target before editing display-only components.",
  };
}

function getScenarioDoNotStartFrom(
  scenario: BrowserScenario,
  editTarget: SourceLocation,
): readonly ScenarioSourceHint[] {
  if (scenario.doNotStartFrom !== undefined && scenario.doNotStartFrom.length > 0) {
    return scenario.doNotStartFrom;
  }

  return uniqueSourceHints(
    scenario.observations.flatMap((observation) => {
      if (observation.source === undefined || sameSource(observation.source, editTarget)) {
        return [];
      }
      return [
        {
          source: observation.source,
          reason:
            "This source was observed in the browser scenario, but the graph-linked repair target owns the behavior path.",
        },
      ];
    }),
  );
}

function uniqueSourceHints(
  hints: readonly ScenarioSourceHint[],
): readonly ScenarioSourceHint[] {
  const seen = new Set<string>();
  const unique: ScenarioSourceHint[] = [];
  for (const hint of hints) {
    const key = `${hint.source.file}:${hint.source.line}:${hint.source.symbol}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(hint);
  }
  return unique;
}

function sameSource(left: SourceLocation, right: SourceLocation): boolean {
  return left.file === right.file && left.line === right.line && left.symbol === right.symbol;
}

async function executeScenarioSteps(input: {
  readonly page: Page;
  readonly scenario: BrowserScenario;
  readonly url: string;
}): Promise<void> {
  for (const step of input.scenario.steps) {
    switch (step.kind) {
      case "open":
        await input.page.goto(input.url);
        break;
      case "clickByTestId":
        await input.page.getByTestId(step.testId).click();
        break;
      case "fillByTestId":
        await input.page.getByTestId(step.testId).fill(step.value);
        break;
      case "waitForTestId":
        await input.page.getByTestId(step.testId).waitFor({ state: "visible" });
        break;
    }
  }
}

async function collectObservations(
  page: Page,
  observations: readonly ScenarioObservation[],
): Promise<ObservationValues> {
  const values = new Map<string, string>();
  for (const observation of observations) {
    const locator = page.getByTestId(observation.testId);
    await locator.waitFor({ state: "visible" });
    const value =
      observation.kind === "inputValue"
        ? await locator.inputValue()
        : await locator.innerText();
    values.set(observation.id, value.trim());
  }
  return values;
}

async function collectRuntimeTrace(page: Page): Promise<readonly TraceEvent[]> {
  const rawTrace = await page.evaluate(() => window.__YOMI_TRACE__?.getTrace() ?? []);
  return normalizeRuntimeTrace(rawTrace);
}

function normalizeRuntimeTrace(input: unknown): readonly TraceEvent[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((event, index) => {
    const value = objectValueOrUndefined(event);
    if (value === undefined) {
      return [];
    }
    const id = optionalStringValue(value.id) ?? `runtime-${index + 1}`;
    const at = optionalStringValue(value.at) ?? "runtime";
    const kind = optionalTraceKind(value.kind);
    const summary = optionalStringValue(value.summary);
    if (kind === undefined || summary === undefined) {
      return [];
    }
    const source = optionalTraceSource(value.source);
    const graphNodeId = optionalStringValue(value.graphNodeId);
    const correlationId = optionalStringValue(value.correlationId);
    const runtimeInstanceId = optionalStringValue(value.runtimeInstanceId);
    return [
      {
        id,
        at,
        kind,
        summary,
        source,
        graphNodeId,
        correlationId,
        runtimeInstanceId,
      },
    ];
  });
}

function optionalTraceKind(input: unknown): TraceEvent["kind"] | undefined {
  if (
    input === "action-requested" ||
    input === "cleanup-ran" ||
    input === "component-mounted" ||
    input === "component-remounted" ||
    input === "component-unmounted" ||
    input === "effect-ran" ||
    input === "handler-invoked" ||
    input === "request-started" ||
    input === "render-committed" ||
    input === "response-resolved" ||
    input === "state-update-requested" ||
    input === "state-committed" ||
    input === "violation-detected"
  ) {
    return input;
  }
  return undefined;
}

function optionalTraceSource(input: unknown): SourceLocation | undefined {
  const value = objectValueOrUndefined(input);
  if (value === undefined) {
    return undefined;
  }
  const file = optionalStringValue(value.file);
  const line = typeof value.line === "number" ? value.line : undefined;
  const symbol = optionalStringValue(value.symbol);
  if (file === undefined || line === undefined || symbol === undefined) {
    return undefined;
  }
  return { file, line, symbol };
}

function parseScenarioStep(input: unknown, sourceName: string): ScenarioStep {
  const value = objectValue(input, sourceName);
  const kind = requiredString(value, "kind", sourceName);
  switch (kind) {
    case "open":
      return { kind };
    case "clickByTestId":
      return {
        kind,
        testId: requiredString(value, "testId", sourceName),
      };
    case "fillByTestId":
      return {
        kind,
        testId: requiredString(value, "testId", sourceName),
        value: requiredString(value, "value", sourceName),
      };
    case "waitForTestId":
      return {
        kind,
        testId: requiredString(value, "testId", sourceName),
      };
    default:
      throw new Error(
        `${sourceName}.kind must be open, clickByTestId, fillByTestId, or waitForTestId.`,
      );
  }
}

function parseScenarioObservation(input: unknown, sourceName: string): ScenarioObservation {
  const value = objectValue(input, sourceName);
  const kind = requiredString(value, "kind", sourceName);
  if (kind !== "inputValue" && kind !== "textContent") {
    throw new Error(`${sourceName}.kind must be inputValue or textContent.`);
  }
  return {
    id: requiredString(value, "id", sourceName),
    kind,
    testId: requiredString(value, "testId", sourceName),
    source: optionalSourceLocation(value, "source", sourceName),
    graphNodeId: optionalString(value, "graphNodeId", sourceName),
  };
}

function parseScenarioAssertion(input: unknown, sourceName: string): ScenarioAssertion {
  const value = objectValue(input, sourceName);
  return {
    id: requiredString(value, "id", sourceName),
    actual: requiredString(value, "actual", sourceName),
    equals: requiredString(value, "equals", sourceName),
    source: optionalSourceLocation(value, "source", sourceName),
    graphNodeId: optionalString(value, "graphNodeId", sourceName),
    message: requiredString(value, "message", sourceName),
  };
}

function optionalRepairTarget(
  value: Readonly<Record<string, unknown>>,
  key: string,
  sourceName: string,
): ScenarioRepairTarget | undefined {
  const field = value[key];
  if (field === undefined) {
    return undefined;
  }
  const repairTarget = objectValue(field, `${sourceName}.${key}`);
  const kind = requiredString(repairTarget, "kind", `${sourceName}.${key}`);
  if (kind !== "ui") {
    throw new Error(`${sourceName}.${key}.kind must be ui.`);
  }
  return {
    kind,
    target: requiredString(repairTarget, "target", `${sourceName}.${key}`),
  };
}

function parseSourceHint(input: unknown, sourceName: string): ScenarioSourceHint {
  const value = objectValue(input, sourceName);
  return {
    source: parseSourceLocation(requiredField(value, "source", sourceName), `${sourceName}.source`),
    reason: requiredString(value, "reason", sourceName),
  };
}

function optionalSourceLocation(
  value: Readonly<Record<string, unknown>>,
  key: string,
  sourceName: string,
): SourceLocation | undefined {
  const field = value[key];
  return field === undefined ? undefined : parseSourceLocation(field, `${sourceName}.${key}`);
}

function parseSourceLocation(input: unknown, sourceName: string): SourceLocation {
  const value = objectValue(input, sourceName);
  return {
    file: requiredString(value, "file", sourceName),
    line: requiredNumber(value, "line", sourceName),
    symbol: requiredString(value, "symbol", sourceName),
  };
}

function requiredField(
  value: Readonly<Record<string, unknown>>,
  key: string,
  sourceName: string,
): unknown {
  const field = value[key];
  if (field === undefined) {
    throw new Error(`${sourceName}.${key} is required.`);
  }
  return field;
}

function requiredArray(
  value: Readonly<Record<string, unknown>>,
  key: string,
  sourceName: string,
): readonly unknown[] {
  const field = requiredField(value, key, sourceName);
  if (!Array.isArray(field)) {
    throw new Error(`${sourceName}.${key} must be an array.`);
  }
  return field;
}

function optionalArray(
  value: Readonly<Record<string, unknown>>,
  key: string,
  sourceName: string,
): readonly unknown[] {
  const field = value[key];
  if (field === undefined) {
    return [];
  }
  if (!Array.isArray(field)) {
    throw new Error(`${sourceName}.${key} must be an array.`);
  }
  return field;
}

function requiredString(
  value: Readonly<Record<string, unknown>>,
  key: string,
  sourceName: string,
): string {
  const field = requiredField(value, key, sourceName);
  if (typeof field !== "string") {
    throw new Error(`${sourceName}.${key} must be a string.`);
  }
  return field;
}

function optionalString(
  value: Readonly<Record<string, unknown>>,
  key: string,
  sourceName: string,
): string | undefined {
  const field = value[key];
  if (field === undefined) {
    return undefined;
  }
  if (typeof field !== "string") {
    throw new Error(`${sourceName}.${key} must be a string.`);
  }
  return field;
}

function requiredNumber(
  value: Readonly<Record<string, unknown>>,
  key: string,
  sourceName: string,
): number {
  const field = requiredField(value, key, sourceName);
  if (typeof field !== "number") {
    throw new Error(`${sourceName}.${key} must be a number.`);
  }
  return field;
}

function objectValue(input: unknown, sourceName: string): Readonly<Record<string, unknown>> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`${sourceName} must be an object.`);
  }
  return input as Readonly<Record<string, unknown>>;
}

function objectValueOrUndefined(input: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  return input as Readonly<Record<string, unknown>>;
}

function optionalStringValue(input: unknown): string | undefined {
  return typeof input === "string" ? input : undefined;
}

async function closeBrowser(browser: Browser): Promise<void> {
  await browser.close();
}

async function loadPlaywright(): Promise<typeof import("playwright")> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<typeof import("playwright")>;
  return dynamicImport("playwright");
}
