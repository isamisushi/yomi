import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { verifyStaleResponseInBrowser } from "../src/browser-verifier";
import {
  defaultGraphPath,
  runInstrument,
  verifyScenario,
  writeDemoGraph,
  writeProjectGraph,
} from "../src/cli-support";

test("demo UI exposes the stale-response failure and fixed state", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("customer-search-input")).toHaveValue("grace");
  await expect(page.getByTestId("rendered-customer")).toHaveText("Ada Lovelace");
  await expect(page.getByTestId("customer-search-status")).toContainText(
    "Older response overwrote the latest query",
  );

  await page.getByTestId("toggle-fix").click();

  await expect(page.getByTestId("rendered-customer")).toHaveText("Grace Hopper");
  await expect(page.getByTestId("customer-search-status")).toContainText(
    "Result matches the latest query",
  );
});

test("browser verifier fails the broken UI and passes the fixed UI", async ({ baseURL }) => {
  expect(baseURL).toBeDefined();
  const url = baseURL ?? "http://127.0.0.1:5173";

  const broken = await verifyStaleResponseInBrowser({ url });
  const fixed = await verifyStaleResponseInBrowser({ mode: "toggle-fixed", url });

  expect(broken.status).toBe("failed");
  expect(broken.trace.at(-1)).toMatchObject({ kind: "violation-detected" });
  expect(fixed.status).toBe("passed");
  expect(fixed.trace.at(-1)).toMatchObject({ kind: "response-resolved" });
});

test("scenario file verifier fails the broken UI and passes the fixed UI", async ({ baseURL }) => {
  expect(baseURL).toBeDefined();
  const url = baseURL ?? "http://127.0.0.1:5173";
  await writeDemoGraph({
    outputPath: ".yomi/e2e-demo-graph.json",
    projectPath: ".",
  });

  const broken = await verifyScenario({
    projectPath: ".",
    scenario: "browser-scenario",
    scenarioFile: "fixtures/scenarios/customer-search-consistency.json",
    url,
  });
  const fixed = await verifyScenario({
    projectPath: ".",
    scenario: "browser-scenario",
    scenarioFile: "fixtures/scenarios/customer-search-consistency-fixed.json",
    url,
  });
  const graphLinked = await verifyScenario({
    graphPath: ".yomi/e2e-demo-graph.json",
    projectPath: ".",
    scenario: "browser-scenario",
    scenarioFile: "fixtures/scenarios/customer-search-consistency-graph.json",
    url,
  });

  expect(broken.status).toBe("failed");
  expect(broken.issue).toBe("scenario-rule-violation");
  expect(broken.trace.at(-1)).toMatchObject({
    kind: "violation-detected",
    graphNodeId: "customer-search-effect",
  });
  expect(broken.violations).toEqual([
    expect.objectContaining({
      expected: "Grace Hopper",
      actual: "Ada Lovelace",
      graphNodeId: "customer-search-effect",
    }),
  ]);
  expect(fixed.status).toBe("passed");
  expect(fixed.issue).toBeUndefined();
  expect(fixed.violations).toEqual([]);
  expect(graphLinked.status).toBe("failed");
  expect(graphLinked.editTarget).toEqual({
    file: "src/features/customers/CustomerSearchPanel.tsx",
    line: 42,
    symbol: "useEffect",
  });
  expect(graphLinked.repairBrief?.nodes.at(-1)).toMatchObject({
    label: "likely edit target",
  });
  expect(graphLinked.confidence).toMatchObject({
    level: "high",
  });
  expect(graphLinked.repairPlan).toMatchObject({
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
  expect(graphLinked.trace.map((event) => event.kind)).toEqual(
    expect.arrayContaining(["effect-ran", "render-committed", "violation-detected"]),
  );
  expect(graphLinked.trace.some((event) => event.correlationId === "customer-search-demo")).toBe(
    true,
  );
});

test("instrumented source emits action, state, effect, and render runtime trace", async () => {
  test.setTimeout(60_000);
  const projectPath = await createInstrumentedRuntimeProject();
  await writeProjectGraph({
    force: true,
    outputPath: defaultGraphPath,
    projectPath,
  });
  await runInstrument({
    adapterImport: "./yomi/react",
    apply: true,
    graphPath: defaultGraphPath,
    projectPath,
    targets: [
      "instrumented-panel",
      "instrumented-panel-on-change-1-action",
      "instrumented-panel-query-state",
      "instrumented-panel-query-effect",
    ],
  });

  const server = await startViteFixture(projectPath, 5184);
  try {
    const result = await verifyScenario({
      projectPath,
      scenario: "browser-scenario",
      scenarioFile: "scenario.json",
      url: "http://127.0.0.1:5184",
    });

    expect(result.status).toBe("passed");
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "action-requested",
          graphNodeId: "instrumented-panel-on-change-1-action",
        }),
        expect.objectContaining({
          kind: "component-mounted",
          graphNodeId: "instrumented-panel",
        }),
        expect.objectContaining({
          kind: "render-committed",
          graphNodeId: "instrumented-panel",
        }),
        expect.objectContaining({
          kind: "state-update-requested",
          graphNodeId: "instrumented-panel-query-state",
        }),
        expect.objectContaining({
          kind: "state-committed",
          graphNodeId: "instrumented-panel-query-state",
        }),
        expect.objectContaining({
          kind: "effect-ran",
          graphNodeId: "instrumented-panel-query-effect",
        }),
      ]),
    );
    const mountedTrace = result.trace.find(
      (event) =>
        event.kind === "component-mounted" &&
        event.graphNodeId === "instrumented-panel",
    );
    const renderTrace = result.trace.find(
      (event) =>
        event.kind === "render-committed" &&
        event.graphNodeId === "instrumented-panel",
    );
    expect(mountedTrace?.runtimeInstanceId).toBeDefined();
    expect(renderTrace?.runtimeInstanceId).toBe(mountedTrace?.runtimeInstanceId);
    expect(result.trace.at(-1)).toMatchObject({
      kind: "response-resolved",
      graphNodeId: "instrumented-panel-query-effect",
    });
  } finally {
    await stopProcess(server);
  }
});

test("TanStack Query cache inconsistency scenario points the agent to the invalidation owner", async () => {
  test.setTimeout(60_000);
  const projectPath = await createCacheInconsistencyProject();
  await writeProjectGraph({
    force: true,
    outputPath: defaultGraphPath,
    projectPath,
  });

  const server = await startViteFixture(projectPath, 5185);
  try {
    const result = await verifyScenario({
      graphPath: defaultGraphPath,
      projectPath,
      scenario: "browser-scenario",
      scenarioFile: "scenario.json",
      url: "http://127.0.0.1:5185",
    });

    expect(result.status).toBe("failed");
    expect(result.issue).toBe("scenario-rule-violation");
    expect(result.editTarget).toEqual({
      file: "src/App.tsx",
      line: 68,
      symbol: "invalidateQueries",
    });
    expect(result.repairBrief?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "data path: cache: invalidate [product]",
        }),
        expect.objectContaining({
          label: "likely edit target",
          source: {
            file: "src/App.tsx",
            line: 68,
            symbol: "invalidateQueries",
          },
        }),
      ]),
    );
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "action-requested",
          graphNodeId: "product-archive-panel-on-click-1-action",
        }),
        expect.objectContaining({
          kind: "state-committed",
          graphNodeId: "product-archive-panel-invalidate-1-cache",
        }),
        expect.objectContaining({
          kind: "violation-detected",
          graphNodeId: "product-archive-panel-invalidate-1-cache",
        }),
      ]),
    );
  } finally {
    await stopProcess(server);
  }
});

test("TanStack Query mutation success cache inconsistency points to onSuccess invalidation", async () => {
  test.setTimeout(60_000);
  const projectPath = await createMutationCacheInconsistencyProject();
  await writeProjectGraph({
    force: true,
    outputPath: defaultGraphPath,
    projectPath,
  });

  const server = await startViteFixture(projectPath, 5186);
  try {
    const result = await verifyScenario({
      graphPath: defaultGraphPath,
      projectPath,
      scenario: "browser-scenario",
      scenarioFile: "scenario.json",
      url: "http://127.0.0.1:5186",
    });

    expect(result.status).toBe("failed");
    expect(result.issue).toBe("scenario-rule-violation");
    expect(result.editTarget).toEqual({
      file: "src/App.tsx",
      line: 67,
      symbol: "invalidateQueries",
    });
    expect(result.repairBrief?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "ui: Archive Paper Mutation",
        }),
        expect.objectContaining({
          label: "data path: cache: invalidate [product]",
        }),
        expect.objectContaining({
          label: "likely edit target",
          source: {
            file: "src/App.tsx",
            line: 67,
            symbol: "invalidateQueries",
          },
        }),
      ]),
    );
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "action-requested",
          graphNodeId: "product-archive-panel-on-click-1-action",
        }),
        expect.objectContaining({
          kind: "state-committed",
          graphNodeId: "product-archive-panel-invalidate-1-cache",
        }),
        expect.objectContaining({
          kind: "violation-detected",
          graphNodeId: "product-archive-panel-invalidate-1-cache",
        }),
      ]),
    );
  } finally {
    await stopProcess(server);
  }
});

test("TanStack Query mutate call cache inconsistency points to mutate options invalidation", async () => {
  test.setTimeout(60_000);
  const projectPath = await createMutationCallCacheInconsistencyProject();
  await writeProjectGraph({
    force: true,
    outputPath: defaultGraphPath,
    projectPath,
  });

  const server = await startViteFixture(projectPath, 5187);
  try {
    const result = await verifyScenario({
      graphPath: defaultGraphPath,
      projectPath,
      scenario: "browser-scenario",
      scenarioFile: "scenario.json",
      url: "http://127.0.0.1:5187",
    });

    expect(result.status).toBe("failed");
    expect(result.issue).toBe("scenario-rule-violation");
    expect(result.editTarget).toEqual({
      file: "src/App.tsx",
      line: 75,
      symbol: "invalidateQueries",
    });
    expect(result.repairBrief?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "ui: Restore Paper Mutation Call",
        }),
        expect.objectContaining({
          label: "data path: mutation settled: restoreMutation",
        }),
        expect.objectContaining({
          label: "data path: cache: invalidate [product]",
        }),
        expect.objectContaining({
          label: "likely edit target",
          source: {
            file: "src/App.tsx",
            line: 75,
            symbol: "invalidateQueries",
          },
        }),
      ]),
    );
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "action-requested",
          graphNodeId: "product-restore-panel-on-click-1-action",
        }),
        expect.objectContaining({
          kind: "state-committed",
          graphNodeId: "product-restore-panel-invalidate-2-cache",
        }),
        expect.objectContaining({
          kind: "violation-detected",
          graphNodeId: "product-restore-panel-invalidate-2-cache",
        }),
      ]),
    );
  } finally {
    await stopProcess(server);
  }
});

test("SWR cache inconsistency scenario points the agent to the mutate owner", async () => {
  test.setTimeout(60_000);
  const projectPath = await createSwrCacheInconsistencyProject();
  await writeProjectGraph({
    force: true,
    outputPath: defaultGraphPath,
    projectPath,
  });

  const server = await startViteFixture(projectPath, 5188);
  try {
    const result = await verifyScenario({
      graphPath: defaultGraphPath,
      projectPath,
      scenario: "browser-scenario",
      scenarioFile: "scenario.json",
      url: "http://127.0.0.1:5188",
    });

    expect(result.status).toBe("failed");
    expect(result.issue).toBe("scenario-rule-violation");
    expect(result.editTarget).toEqual({
      file: "src/App.tsx",
      line: 65,
      symbol: "mutate",
    });
    expect(result.repairBrief?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "ui: Archive Paper SWR",
        }),
        expect.objectContaining({
          label: "data path: cache: mutate [/api/product]",
        }),
        expect.objectContaining({
          label: "likely edit target",
          source: {
            file: "src/App.tsx",
            line: 65,
            symbol: "mutate",
          },
        }),
      ]),
    );
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "action-requested",
          graphNodeId: "product-swrpanel-on-click-1-action",
        }),
        expect.objectContaining({
          kind: "state-committed",
          graphNodeId: "product-swrpanel-mutate-1-cache",
        }),
        expect.objectContaining({
          kind: "violation-detected",
          graphNodeId: "product-swrpanel-mutate-1-cache",
        }),
      ]),
    );
  } finally {
    await stopProcess(server);
  }
});

test("SWR optimistic rollback scenario points the agent to the bound mutate owner", async () => {
  test.setTimeout(60_000);
  const projectPath = await createSwrOptimisticInconsistencyProject();
  await writeProjectGraph({
    force: true,
    outputPath: defaultGraphPath,
    projectPath,
  });

  const server = await startViteFixture(projectPath, 5189);
  try {
    const result = await verifyScenario({
      graphPath: defaultGraphPath,
      projectPath,
      scenario: "browser-scenario",
      scenarioFile: "scenario.json",
      url: "http://127.0.0.1:5189",
    });

    expect(result.status).toBe("failed");
    expect(result.issue).toBe("scenario-rule-violation");
    expect(result.editTarget).toEqual({
      file: "src/App.tsx",
      line: 64,
      symbol: "mutateProducts",
    });
    expect(result.repairBrief?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "ui: Archive Paper Optimistic",
        }),
        expect.objectContaining({
          label: "data path: cache policy: optimistic update",
          detail: expect.stringContaining("rollbackOnError:false"),
        }),
        expect.objectContaining({
          label: "data path: cache: mutate [/api/products]",
        }),
        expect.objectContaining({
          label: "likely edit target",
          source: {
            file: "src/App.tsx",
            line: 64,
            symbol: "mutateProducts",
          },
        }),
      ]),
    );
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "action-requested",
          graphNodeId: "product-swroptimistic-panel-on-click-1-action",
        }),
        expect.objectContaining({
          kind: "state-committed",
          graphNodeId: "product-swroptimistic-panel-mutate-1-cache",
        }),
        expect.objectContaining({
          kind: "violation-detected",
          graphNodeId: "product-swroptimistic-panel-mutate-1-cache",
        }),
      ]),
    );
  } finally {
    await stopProcess(server);
  }
});

async function createInstrumentedRuntimeProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "yomi-instrumented-runtime-"));
  await cp(resolve("fixtures/instrumented-runtime"), projectPath, { recursive: true });

  await installLocalYomiAdapter(projectPath);
  return projectPath;
}

async function createCacheInconsistencyProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "yomi-cache-inconsistency-"));
  await cp(resolve("fixtures/cache-inconsistency"), projectPath, { recursive: true });

  await installLocalYomiAdapter(projectPath);
  return projectPath;
}

async function createMutationCacheInconsistencyProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "yomi-mutation-cache-inconsistency-"));
  await cp(resolve("fixtures/mutation-cache-inconsistency"), projectPath, { recursive: true });

  await installLocalYomiAdapter(projectPath);
  return projectPath;
}

async function createMutationCallCacheInconsistencyProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "yomi-mutation-call-cache-inconsistency-"));
  await cp(resolve("fixtures/mutation-call-cache-inconsistency"), projectPath, { recursive: true });

  await installLocalYomiAdapter(projectPath);
  return projectPath;
}

async function createSwrCacheInconsistencyProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "yomi-swr-cache-inconsistency-"));
  await cp(resolve("fixtures/swr-cache-inconsistency"), projectPath, { recursive: true });

  await installLocalYomiAdapter(projectPath);
  return projectPath;
}

async function createSwrOptimisticInconsistencyProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "yomi-swr-optimistic-inconsistency-"));
  await cp(resolve("fixtures/swr-optimistic-inconsistency"), projectPath, { recursive: true });

  await installLocalYomiAdapter(projectPath);
  return projectPath;
}

async function installLocalYomiAdapter(projectPath: string): Promise<void> {
  const yomiAdapterPath = join(projectPath, "src/yomi");
  await mkdir(yomiAdapterPath, { recursive: true });
  await symlink(resolve("node_modules"), join(projectPath, "node_modules"), "dir");
  await copySourceFile("src/react.ts", join(yomiAdapterPath, "react.ts"));
  await copySourceFile(
    "src/react-instrumentation.ts",
    join(yomiAdapterPath, "react-instrumentation.ts"),
  );
  await copySourceFile("src/runtime-trace.ts", join(yomiAdapterPath, "runtime-trace.ts"));
  await copySourceFile("src/tanstack-query.ts", join(yomiAdapterPath, "tanstack-query.ts"));
  await copySourceFile("src/yomi-ir.ts", join(yomiAdapterPath, "yomi-ir.ts"));
}

async function copySourceFile(from: string, to: string): Promise<void> {
  await writeFile(to, await readFile(resolve(from), "utf8"), "utf8");
}

async function startViteFixture(
  projectPath: string,
  port: number,
): Promise<ChildProcessWithoutNullStreams> {
  const viteBin = resolve("node_modules/vite/bin/vite.js");
  const server = spawn(process.execPath, [
    viteBin,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
    projectPath,
  ]);

  try {
    await waitForServer(`http://127.0.0.1:${port}`);
    return server;
  } catch (error) {
    await stopProcess(server);
    throw error;
  }
}

async function waitForServer(url: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopProcess(process: ChildProcessWithoutNullStreams): Promise<void> {
  if (process.exitCode !== null) {
    return;
  }
  await new Promise<void>((resolveStop) => {
    process.once("exit", () => resolveStop());
    process.kill();
    setTimeout(resolveStop, 2_000);
  });
}
