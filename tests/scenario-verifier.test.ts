import { describe, expect, test } from "bun:test";

import {
  evaluateScenario,
  parseBrowserScenario,
  readBrowserScenarioFile,
  resolveScenarioRepairContext,
} from "../src/scenario-verifier";
import { demoGraph } from "../src/yomi-ir";

describe("browser scenario verifier", () => {
  test("parses a browser scenario file with source-linked repair hints", async () => {
    const scenario = await readBrowserScenarioFile({
      path: "fixtures/scenarios/customer-search-consistency.json",
      projectPath: ".",
    });

    expect(scenario.name).toBe("customer-search-consistency");
    expect(scenario.editTarget).toEqual({
      file: "src/features/customers/CustomerSearchPanel.tsx",
      line: 42,
      symbol: "useEffect",
    });
    expect(scenario.doNotStartFrom[0]?.source.symbol).toBe("CustomerCard");
  });

  test("parses cache inconsistency scenario with graph-linked repair target", async () => {
    const scenario = await readBrowserScenarioFile({
      path: "fixtures/cache-inconsistency/scenario.json",
      projectPath: ".",
    });

    expect(scenario.name).toBe("cache-inconsistency");
    expect(scenario.repairTarget).toEqual({
      kind: "ui",
      target: "Archive Paper",
    });
    expect(scenario.editTarget).toEqual({
      file: "src/App.tsx",
      line: 68,
      symbol: "invalidateQueries",
    });
    expect(scenario.assertions[0]).toMatchObject({
      actual: "visibleProducts",
      graphNodeId: "product-archive-panel-invalidate-1-cache",
    });
  });

  test("parses mutation cache inconsistency scenario with graph-linked repair target", async () => {
    const scenario = await readBrowserScenarioFile({
      path: "fixtures/mutation-cache-inconsistency/scenario.json",
      projectPath: ".",
    });

    expect(scenario.name).toBe("mutation-cache-inconsistency");
    expect(scenario.repairTarget).toEqual({
      kind: "ui",
      target: "Archive Paper Mutation",
    });
    expect(scenario.editTarget).toEqual({
      file: "src/App.tsx",
      line: 67,
      symbol: "invalidateQueries",
    });
    expect(scenario.assertions[0]).toMatchObject({
      actual: "visibleProducts",
      graphNodeId: "product-archive-panel-invalidate-1-cache",
    });
  });

  test("parses SWR cache inconsistency scenario with graph-linked repair target", async () => {
    const scenario = await readBrowserScenarioFile({
      path: "fixtures/swr-cache-inconsistency/scenario.json",
      projectPath: ".",
    });

    expect(scenario.name).toBe("swr-cache-inconsistency");
    expect(scenario.repairTarget).toEqual({
      kind: "ui",
      target: "Archive Paper SWR",
    });
    expect(scenario.editTarget).toEqual({
      file: "src/App.tsx",
      line: 65,
      symbol: "mutate",
    });
    expect(scenario.assertions[0]).toMatchObject({
      actual: "visibleProducts",
      graphNodeId: "product-swrpanel-mutate-1-cache",
    });
  });

  test("parses SWR optimistic inconsistency scenario with graph-linked repair target", async () => {
    const scenario = await readBrowserScenarioFile({
      path: "fixtures/swr-optimistic-inconsistency/scenario.json",
      projectPath: ".",
    });

    expect(scenario.name).toBe("swr-optimistic-inconsistency");
    expect(scenario.repairTarget).toEqual({
      kind: "ui",
      target: "Archive Paper Optimistic",
    });
    expect(scenario.editTarget).toEqual({
      file: "src/App.tsx",
      line: 64,
      symbol: "mutateProducts",
    });
    expect(scenario.assertions[0]).toMatchObject({
      actual: "visibleProducts",
      graphNodeId: "product-swroptimistic-panel-mutate-1-cache",
    });
  });

  test("rejects invalid scenario input at the JSON boundary", () => {
    expect(() =>
      parseBrowserScenario({
        name: "broken",
        steps: [{ kind: "open" }],
        observations: [],
        assertions: [],
      }),
    ).toThrow("scenario.repairTarget or scenario.editTarget is required.");
  });

  test("parses input and wait steps for authored browser workflows", () => {
    const scenario = parseBrowserScenario({
      name: "form-workflow",
      steps: [
        { kind: "open" },
        { kind: "waitForTestId", testId: "email" },
        { kind: "fillByTestId", testId: "email", value: "agent@example.com" },
      ],
      observations: [],
      assertions: [],
      editTarget: {
        file: "src/Form.tsx",
        line: 12,
        symbol: "Form",
      },
      doNotStartFrom: [],
      suggestedFixShape: "Fix form state ownership.",
    });

    expect(scenario.steps).toEqual([
      { kind: "open" },
      { kind: "waitForTestId", testId: "email" },
      { kind: "fillByTestId", testId: "email", value: "agent@example.com" },
    ]);
  });

  test("evaluates failed assertions as source-linked violation trace", async () => {
    const scenario = await readBrowserScenarioFile({
      path: "fixtures/scenarios/customer-search-consistency.json",
      projectPath: ".",
    });
    const result = evaluateScenario({
      scenario,
      observations: new Map([
        ["query", "grace"],
        ["renderedCustomer", "Ada Lovelace"],
      ]),
    });

    expect(result.status).toBe("failed");
    expect(result.summary).toBe("customer-search-consistency failed 1/1 assertion(s).");
    expect(result.trace.at(-1)).toMatchObject({
      kind: "violation-detected",
      graphNodeId: "customer-search-effect",
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 42,
        symbol: "useEffect",
      },
    });
  });

  test("resolves repair context from a graph-linked UI target", async () => {
    const scenario = await readBrowserScenarioFile({
      path: "fixtures/scenarios/customer-search-consistency-graph.json",
      projectPath: ".",
    });
    const context = resolveScenarioRepairContext({
      graph: demoGraph,
      scenario,
    });

    expect(context.editTarget).toEqual({
      file: "src/features/customers/CustomerSearchPanel.tsx",
      line: 42,
      symbol: "useEffect",
    });
    expect(context.doNotStartFrom.map((hint) => hint.source.symbol)).toEqual([
      "SearchInput",
      "CustomerCard",
    ]);
    expect(context.repairBrief?.summary).toContain("edit query repair brief");
  });

  test("returns graph-linked repair brief with scenario verification output", async () => {
    const scenario = await readBrowserScenarioFile({
      path: "fixtures/scenarios/customer-search-consistency-graph.json",
      projectPath: ".",
    });
    const result = evaluateScenario({
      graph: demoGraph,
      runtimeTrace: [
        {
          id: "runtime-1",
          at: "runtime:12",
          kind: "effect-ran",
          summary: "Customer search effect ran.",
          source: {
            file: "src/features/customers/CustomerSearchPanel.tsx",
            line: 42,
            symbol: "useEffect",
          },
          graphNodeId: "customer-search-effect",
          correlationId: "customer-search-demo",
        },
      ],
      scenario,
      observations: new Map([
        ["query", "grace"],
        ["renderedCustomer", "Ada Lovelace"],
      ]),
    });

    expect(result.status).toBe("failed");
    expect(result.editTarget).toEqual({
      file: "src/features/customers/CustomerSearchPanel.tsx",
      line: 42,
      symbol: "useEffect",
    });
    expect(result.repairBrief?.nodes.at(-1)).toMatchObject({
      label: "likely edit target",
    });
    expect(result.violations).toEqual([
      expect.objectContaining({
        id: "latest-query-rendered",
        expected: "Grace Hopper",
        actual: "Ada Lovelace",
        graphNodeId: "customer-search-effect",
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
    expect(result.repairPlan?.evidenceTrail.map((entry) => entry.role)).toEqual(
      expect.arrayContaining(["visible-surface", "behavior-owner", "data-cache"]),
    );
    expect(result.trace[0]).toMatchObject({
      kind: "effect-ran",
      graphNodeId: "customer-search-effect",
    });
  });

  test("evaluates passed assertions as source-linked successful trace", async () => {
    const scenario = await readBrowserScenarioFile({
      path: "fixtures/scenarios/customer-search-consistency.json",
      projectPath: ".",
    });
    const result = evaluateScenario({
      scenario,
      observations: new Map([
        ["query", "grace"],
        ["renderedCustomer", "Grace Hopper"],
      ]),
    });

    expect(result.status).toBe("passed");
    expect(result.summary).toBe("customer-search-consistency passed 1 assertion(s).");
    expect(result.trace.at(-1)).toMatchObject({
      kind: "response-resolved",
      graphNodeId: "customer-search-effect",
    });
  });
});
