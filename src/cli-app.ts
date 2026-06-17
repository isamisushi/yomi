import { join } from "node:path";

import { Crust, type CrustPlugin } from "@crustjs/core";
import { didYouMeanPlugin, helpPlugin, versionPlugin } from "@crustjs/plugins";
import { skillPlugin } from "@crustjs/skills";

import {
  defaultGraphPath,
  explainLastFailure,
  readGraph,
  runBenchmark,
  runConceptDoctor,
  listExamples,
  runInstrument,
  runQuery,
  runRepair,
  runRuntimeTraceQuery,
  runTracePlanFromGraph,
  verifyScenario,
  writeDemoGraph,
  writeJsonError,
  writeJson,
  writeProjectGraph,
} from "./cli-support";

const yomiSkillInstructions = [
  "Use Yomi when a React UI symptom needs to be mapped to the source that owns the behavior.",
  "Start with `yomi index` for the target project, then prefer `yomi repair \"<visible label>\"` when the user gives a visible UI symptom.",
  "`yomi repair` is the main edit contract: use its `editTarget` as the first file/symbol to inspect, treat `doNotStartFrom` as evidence-only surfaces, and keep `repairBrief.nodes` as supporting context.",
  "Use `yomi query brief-from-ui \"<label>\"` when you need the raw source-linked graph context behind a UI label.",
  "Use `yomi query action-path <action-id>` and `yomi query data-path <action-id>` to inspect state, effect, remote data, and cache ownership before editing.",
  "Use `yomi plan-trace \"<visible label>\"` when static repair evidence is not enough and the agent needs the smallest source-linked runtime trace plan.",
  "Use `yomi doctor \"<visible label>\"` after indexing when you need to confirm the graph and repair output satisfy Yomi's agent-facing concept contract.",
  "Use `yomi verify ... --scenarioFile <path> --url <url>` after the code change when a browser scenario exists, and use the returned trace to confirm the visible symptom no longer appears.",
  "Do not edit display-only components just because they render the stale or incorrect value; follow Yomi's source-linked behavior owner unless code inspection proves the graph is stale.",
  "All Yomi commands are agent-facing JSON by default; parse `ok`, `data`, and `error` fields instead of scraping terminal prose or stack traces.",
];

function resolveBundledSkillSourceDir(relativePath: string): string {
  const packageRoot = process.env.YOMI_PACKAGE_ROOT;
  if (packageRoot === undefined || packageRoot.trim().length === 0) {
    return relativePath;
  }
  return join(packageRoot, relativePath);
}

const jsonErrorPlugin = (): CrustPlugin => ({
  name: "yomi-json-error",
  middleware: async (_context, next) => {
    try {
      await next();
    } catch (error) {
      writeJsonError(error);
      process.exitCode = 1;
    }
  },
});

export const app = new Crust("yomi")
  .meta({
    description:
      "Agent-facing frontend development support layer for React applications.",
  })
  .use(helpPlugin())
  .use(didYouMeanPlugin())
  .use(jsonErrorPlugin())
  .use(versionPlugin("0.0.0"))
  .use(
    skillPlugin({
      version: "0.0.0",
      defaultScope: "project",
      autoUpdate: false,
      allowedTools: "Bash(yomi *) Read Grep Glob",
      compatibility:
        "Requires the yomi CLI on PATH and a React project that can be indexed by Yomi.",
      instructions: yomiSkillInstructions,
      customSkills: [
        {
          name: "yomi-react-repair",
          sourceDir: resolveBundledSkillSourceDir("skills/yomi-react-repair"),
        },
        {
          name: "yomi-react-instrumentation",
          sourceDir: resolveBundledSkillSourceDir("skills/yomi-react-instrumentation"),
        },
      ],
    }),
  )
  .flags({
    project: {
      type: "path",
      default: ".",
      description: "React project root.",
      inherit: true,
    },
    graph: {
      type: "string",
      default: defaultGraphPath,
      description: "Path to the Yomi graph, relative to --project unless absolute.",
      inherit: true,
    },
  })
  .command("index", (cmd) =>
    cmd
      .meta({
        description:
          "Build a Yomi graph by indexing React source in the project.",
      })
      .flags({
        output: {
          type: "string",
          default: defaultGraphPath,
          description: "Output graph path, relative to --project unless absolute.",
        },
        demo: {
          type: "boolean",
          default: false,
          description: "Write the bundled demo graph instead of indexing source.",
        },
        force: {
          type: "boolean",
          default: false,
          description: "Rebuild the graph even when the index cache is fresh.",
        },
      })
      .run(async ({ flags }) => {
        const writeGraph = flags.demo ? writeDemoGraph : writeProjectGraph;
        const result = await writeGraph({
          force: flags.force,
          outputPath: flags.output,
          projectPath: flags.project,
        });
        writeJson(result);
      }),
  )
  .command("query", (cmd) =>
    cmd
      .meta({
        description:
          "Run a source-linked frontend graph query for a coding agent.",
        usage:
          "yomi query <find-ui-node|component-owner|action-path|data-path|effects-triggered-by|state-owners|hook-dependencies|impact|repair-brief|brief-from-ui|source-locations|runtime-trace> <target>",
      })
      .args([
        {
          name: "query",
          type: "string",
          required: true,
          description:
            "Query name: find-ui-node, component-owner, action-path, data-path, effects-triggered-by, state-owners, hook-dependencies, impact, repair-brief, brief-from-ui, source-locations, or runtime-trace.",
        },
        {
          name: "target",
          type: "string",
          required: true,
          description: "Graph node id, state name, symbol id, or component id.",
        },
      ] as const)
      .run(async ({ args, flags }) => {
        if (args.query === "runtime-trace") {
          writeJson(runRuntimeTraceQuery({ interactionId: args.target }));
          return;
        }
        const graph = await readGraph({
          graphPath: flags.graph,
          projectPath: flags.project,
        });
        const result = runQuery({
          graph,
          query: args.query,
          target: args.target,
        });
        writeJson(result);
      }),
  )
  .command("verify", (cmd) =>
    cmd
      .meta({
        description:
          "Run a Yomi verifier scenario and return an agent-readable failure report.",
      })
      .args([
        {
          name: "scenario",
          type: "string",
          default: "stale-response",
          description:
            "Verifier scenario name: stale-response, stale-response-fixed, missing-effect-cleanup, missing-effect-cleanup-fixed, double-submit, double-submit-fixed, ui-validation-enforcement, ui-validation-enforcement-fixed, key-remount-state-loss, key-remount-state-loss-fixed, shared-hook-regression, shared-hook-regression-fixed, prop-rename-impact, or prop-rename-impact-fixed.",
        },
      ] as const)
      .flags({
        fixed: {
          type: "boolean",
          default: false,
          description: "Run the fixed version of the verifier scenario.",
        },
        url: {
          type: "string",
          description: "Optional browser URL to verify with Playwright.",
        },
        scenarioFile: {
          type: "string",
          description:
            "Path to a Yomi browser scenario JSON file, relative to --project unless absolute.",
        },
      })
      .run(async ({ args, flags }) => {
        writeJson(
          await verifyScenario({
            fixed: flags.fixed,
            graphPath: flags.graph,
            projectPath: flags.project,
            scenario: args.scenario,
            scenarioFile: flags.scenarioFile,
            url: flags.url,
          }),
        );
      }),
  )
  .command("repair", (cmd) =>
    cmd
      .meta({
        description:
          "Resolve a visible UI target into an agent-ready source edit plan.",
        usage: "yomi repair <visible-ui-label-or-id>",
      })
      .args([
        {
          name: "target",
          type: "string",
          required: true,
          description:
            "Visible UI label or Yomi UI node id to repair from, such as \"Customer search\".",
        },
      ] as const)
      .flags({
        scenarioFile: {
          type: "string",
          description:
            "Optional Yomi browser scenario JSON file to include as an executable verify command.",
        },
        url: {
          type: "string",
          description:
            "Optional browser URL to include with the generated verify command.",
        },
      })
      .run(async ({ args, flags }) => {
        const graph = await readGraph({
          graphPath: flags.graph,
          projectPath: flags.project,
        });
        writeJson(
          runRepair({
            graph,
            scenarioFile: flags.scenarioFile,
            target: args.target,
            url: flags.url,
          }),
        );
      }),
  )
  .command("plan-trace", (cmd) =>
    cmd
      .meta({
        description:
          "Turn a visible UI target into a minimal source-linked instrumentation plan.",
        usage: "yomi plan-trace <visible-ui-label-or-id>",
      })
      .args([
        {
          name: "target",
          type: "string",
          required: true,
          description:
            "Visible UI label or Yomi UI node id to trace from, such as \"Customer search\".",
        },
      ] as const)
      .flags({
        scenarioFile: {
          type: "string",
          description:
            "Optional Yomi browser scenario JSON file to preserve in the nested repair plan.",
        },
        url: {
          type: "string",
          description:
            "Optional browser URL to preserve in the nested repair plan.",
        },
      })
      .run(async ({ args, flags }) => {
        writeJson(
          await runTracePlanFromGraph({
            graphPath: flags.graph,
            projectPath: flags.project,
            scenarioFile: flags.scenarioFile,
            target: args.target,
            url: flags.url,
          }),
        );
      }),
  )
  .command("benchmark", (cmd) =>
    cmd
      .meta({
        description:
          "Run a benchmark that checks whether Yomi reaches the expected React repair target.",
      })
      .args([
        {
          name: "benchmark",
          type: "string",
          default: "react-repair",
          description: "Benchmark name. Currently supports react-repair.",
        },
      ] as const)
      .flags({
        currentProject: {
          type: "boolean",
          default: false,
          description:
            "Run against --project instead of the bundled benchmark fixture.",
        },
      })
      .run(({ args, flags }) => {
        writeJson(
          runBenchmark({
            benchmark: args.benchmark,
            projectPath: flags.currentProject ? flags.project : undefined,
          }),
        );
      }),
  )
  .command("examples", (cmd) =>
    cmd
      .meta({
        description:
          "List example React repair tasks with expected Yomi edit targets.",
      })
      .args([
        {
          name: "catalog",
          type: "string",
          default: "react-repair",
          description: "Examples catalog name. Currently supports react-repair.",
        },
      ] as const)
      .run(({ args }) => {
        writeJson(listExamples({ catalog: args.catalog }));
      }),
  )
  .command("doctor", (cmd) =>
    cmd
      .meta({
        description:
          "Check whether the indexed graph satisfies Yomi's agent-facing concept contract.",
        usage: "yomi doctor [visible-ui-label-or-id]",
      })
      .args([
        {
          name: "target",
          type: "string",
          default: "",
          description:
            "Optional visible UI label or Yomi UI node id to audit. Defaults to all actionable UI labels in the graph.",
        },
      ] as const)
      .run(async ({ args, flags }) => {
        writeJson(
          await runConceptDoctor({
            graphPath: flags.graph,
            projectPath: flags.project,
            target: args.target === "" ? undefined : args.target,
          }),
        );
      }),
  )
  .command("instrument", (cmd) =>
    cmd
      .meta({
        description:
          "Add opt-in React runtime instrumentation for a source-linked Yomi graph node.",
        usage:
          "yomi instrument <graph-node-id> [--targets id,id] [--apply] [--adapter @isamisushi/yomi/react] [--queryAdapter @isamisushi/yomi/tanstack-query]",
      })
      .args([
        {
          name: "target",
          type: "string",
          required: true,
          description:
            "Yomi graph node id to instrument. Supports component ids, useEffect/router-refresh hook ids, local useState ids, JSX event action ids, cache operation ids, external store usage ids, Redux action usage ids, Redux selector usage ids, and React Hook Form field ids.",
        },
      ] as const)
      .flags({
        adapter: {
          type: "string",
          default: "@isamisushi/yomi/react",
          description:
            "Module specifier that exports Yomi's React instrumentation adapter.",
        },
        apply: {
          type: "boolean",
          default: false,
          description: "Write the instrumentation change to source files.",
        },
        targets: {
          type: "string",
          description:
            "Comma-separated graph node ids to instrument in one source snapshot.",
        },
        queryAdapter: {
          type: "string",
          default: "@isamisushi/yomi/tanstack-query",
          description:
            "Module specifier that exports Yomi's TanStack Query instrumentation adapter.",
        },
      })
      .run(async ({ args, flags }) => {
        writeJson(
          await runInstrument({
            adapterImport: flags.adapter,
            apply: flags.apply,
            graphPath: flags.graph,
            projectPath: flags.project,
            queryAdapterImport: flags.queryAdapter,
            target: args.target,
            targets: parseTargetsFlag(flags.targets),
          }),
        );
      }),
  )
  .command("explain", (cmd) =>
    cmd
      .meta({
        description:
          "Explain the latest known verifier failure as a repair brief for a coding agent.",
      })
      .args([
        {
          name: "subject",
          type: "string",
          default: "last-failure",
          description: "Explanation subject. Currently supports last-failure.",
        },
      ] as const)
      .run(({ args }) => {
        if (args.subject !== "last-failure") {
          throw new Error(
            `Unknown explanation subject "${args.subject}". Expected last-failure.`,
          );
        }
        writeJson(explainLastFailure());
      }),
  );

export default app;

function parseTargetsFlag(input: string | undefined): readonly string[] | undefined {
  if (input === undefined) {
    return undefined;
  }
  return input.split(",").map((target) => target.trim()).filter((target) => target !== "");
}
