import { describe, expect, test } from "bun:test";

import { runTracePlan } from "../src/trace-plan";
import { demoGraph } from "../src/yomi-ir";

describe("trace plan", () => {
  test("turns a visible UI symptom into a minimal instrumentation command", () => {
    const result = runTracePlan({
      graph: demoGraph,
      target: "Customer search",
    });

    expect(result.uiTarget).toBe("Customer search");
    expect(result.bugType).toBe("stale-response");
    expect(result.recommendedTraceTargets.map((target) => target.graphNodeId)).toEqual([
      "edit-query-action",
      "query-state",
      "loading-state",
      "customer-search-effect",
      "search-input",
    ]);
    expect(result.recommendedTraceTargets.map((target) => target.kind)).toEqual([
      "action",
      "state",
      "state",
      "effect",
      "component",
    ]);
    expect(result.instrumentCommand).toBe(
      "yomi instrument edit-query-action --targets query-state,loading-state,customer-search-effect,search-input",
    );
    expect(result.nextCommands[0]).toBe(result.instrumentCommand);
    expect(result.why).toContain("smallest source-linked behavior path");
    expect(result.repairPlan.editTarget).toEqual({
      file: "src/features/customers/CustomerSearchPanel.tsx",
      line: 42,
      symbol: "useEffect",
    });
  });
});
