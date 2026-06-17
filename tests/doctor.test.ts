import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { runConceptDoctor } from "../src/cli-support";
import { runDoctor } from "../src/doctor";
import { demoGraph, type YomiGraph } from "../src/yomi-ir";

describe("Yomi concept doctor", () => {
  test("passes the demo graph concept contract", () => {
    const result = runDoctor({ graph: demoGraph, target: "Customer search" });

    expect(result.status).toBe("passed");
    expect(result.summary).toBe("Yomi concept contract passed for 1 repair target(s).");
    expect(result.checks.map((check) => `${check.id}:${check.status}`)).toEqual([
      "source-linked-graph:passed",
      "short-agent-queries:passed",
      "repair-contract:passed",
      "runtime-trace-join:passed",
    ]);
    expect(result.nextCommands).toEqual([
      'yomi repair "Customer search"',
      "yomi benchmark react-repair",
    ]);
    expect(result.repairTargets).toEqual([
      expect.objectContaining({
        uiTarget: "Customer search",
        status: "passed",
        confidence: expect.objectContaining({ level: "high" }),
        missing: [],
      }),
    ]);
  });

  test("fails when the graph cannot produce an agent-ready repair contract", () => {
    const brokenGraph: YomiGraph = {
      ...demoGraph,
      actions: [],
      ui: demoGraph.ui.map((node) => ({ ...node, actionId: undefined })),
    };

    const result = runDoctor({ graph: brokenGraph });

    expect(result.status).toBe("failed");
    expect(result.nextCommands).toEqual([
      "yomi index --force",
      "yomi query find-ui-node <visible-ui-label>",
      "yomi doctor",
    ]);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "source-linked-graph",
          status: "failed",
        }),
        expect.objectContaining({
          id: "repair-contract",
          status: "failed",
          evidence: expect.arrayContaining(["targets:0"]),
        }),
      ]),
    );
  });

  test("is available through CLI support against a graph file", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "yomi-doctor-"));
    await writeFile(join(projectPath, "graph.json"), `${JSON.stringify(demoGraph)}\n`, "utf8");

    const result = await runConceptDoctor({
      graphPath: "graph.json",
      projectPath,
      target: "Customer search",
    });

    expect(result.status).toBe("passed");
    expect(result.repairTargets.at(0)?.editTarget).toEqual({
      file: "src/features/customers/CustomerSearchPanel.tsx",
      line: 42,
      symbol: "useEffect",
    });
  });
});
