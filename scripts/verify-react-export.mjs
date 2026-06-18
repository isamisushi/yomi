import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const packageRoot = resolve(projectRoot, ".crust/npm/runtime");
const packageName = "@isamisushi/yomi";
const reactImport = `${packageName}/react`;
const queryImport = `${packageName}/tanstack-query`;
const tempRoot = mkdtempSync(join(tmpdir(), "yomi-react-export-"));
const nodeModules = join(tempRoot, "node_modules");

mkdirSync(nodeModules, { recursive: true });
mkdirSync(join(nodeModules, "@isamisushi"), { recursive: true });
symlinkSync(packageRoot, join(nodeModules, "@isamisushi", "yomi"), "dir");
symlinkSync(resolve(projectRoot, "node_modules/react"), join(nodeModules, "react"), "dir");
symlinkSync(
  resolve(projectRoot, "node_modules/@types"),
  join(nodeModules, "@types"),
  "dir",
);

const runtimeCheck = spawnSync(
  process.execPath,
  [
    "--input-type=module",
    "--eval",
    [
      `const mod = await import("${reactImport}");`,
      'for (const name of ["createYomiAction", "traceYomiReduxAction", "traceYomiRouterRefresh", "useYomiExternalStoreTrace", "useYomiFormFieldTrace", "useYomiReduxSelectorTrace", "useYomiTraceEffect", "useYomiRenderTrace", "useYomiTracedState", "ensureYomiRuntimeTrace", "recordRuntimeTrace"]) {',
      '  if (typeof mod[name] !== "function") throw new Error(`${name} is not exported as a function`);',
      "}",
      `const queryMod = await import("${queryImport}");`,
      'for (const name of ["createYomiTanStackQueryClient", "traceTanStackQueryOperation"]) {',
      '  if (typeof queryMod[name] !== "function") throw new Error(`${name} is not exported as a function`);',
      "}",
    ].join("\n"),
  ],
  {
    cwd: tempRoot,
    encoding: "utf8",
    stdio: "inherit",
  },
);
if (runtimeCheck.status !== 0) {
  throw new Error(`Runtime ${reactImport} export verification failed with status ${runtimeCheck.status}`);
}

writeFileSync(
  join(tempRoot, "consumer.ts"),
  [
    `import { createYomiAction, useYomiExternalStoreTrace, type YomiExternalStoreUsageKind, type YomiTraceMetadata } from "${reactImport}";`,
    "const metadata: YomiTraceMetadata = {",
    '  name: "change query",',
    '  source: { file: "src/App.tsx", line: 1, symbol: "onChange" },',
    '  graphNodeId: "app-on-change-action",',
    "};",
    "const handler = createYomiAction(metadata, (value: string) => value.length);",
    'handler("agent");',
    'const usageKind: YomiExternalStoreUsageKind = "write";',
    'useYomiExternalStoreTrace(metadata, "inventorySortAtom", ["setSortMode"], usageKind);',
    `import { createYomiTanStackQueryClient } from "${queryImport}";`,
    "const client = createYomiTanStackQueryClient({",
    "  invalidateQueries: (input: { readonly queryKey: readonly string[] }) => input.queryKey,",
    "}, {",
    "  invalidate: { name: \"invalidate products\", graphNodeId: \"products-cache\" },",
    "});",
    'client.invalidateQueries({ queryKey: ["products"] });',
  ].join("\n"),
  "utf8",
);

const typeCheck = spawnSync(
  process.execPath,
  [
    resolve(projectRoot, "node_modules/typescript/bin/tsc"),
    "--ignoreConfig",
    "consumer.ts",
    "--noEmit",
    "--module",
    "ESNext",
    "--moduleResolution",
    "Bundler",
    "--target",
    "ES2022",
    "--jsx",
    "react-jsx",
    "--strict",
    "--skipLibCheck",
  ],
  {
    cwd: tempRoot,
    encoding: "utf8",
    stdio: "inherit",
  },
);
if (typeCheck.status !== 0) {
  throw new Error(`Type ${reactImport} export verification failed with status ${typeCheck.status}`);
}

console.log(`Verified staged ${reactImport} and ${queryImport} runtime and type exports.`);
