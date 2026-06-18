import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const stageRoot = resolve(projectRoot, ".crust/npm");
const manifestPath = join(stageRoot, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const cliPackageName = manifest.root.name;
const runtimePackageName = manifest.runtime?.name ?? "@isamisushi/yomi";
const reactImport = `${runtimePackageName}/react`;
const queryImport = `${runtimePackageName}/tanstack-query`;
const expectedPlatforms = [
  {
    target: "linux-x64",
    os: "linux",
    cpu: "x64",
    binaryFilename: "yomi-bun-linux-x64-baseline",
  },
  {
    target: "linux-arm64",
    os: "linux",
    cpu: "arm64",
    binaryFilename: "yomi-bun-linux-arm64",
  },
  {
    target: "darwin-x64",
    os: "darwin",
    cpu: "x64",
    binaryFilename: "yomi-bun-darwin-x64",
  },
  {
    target: "darwin-arm64",
    os: "darwin",
    cpu: "arm64",
    binaryFilename: "yomi-bun-darwin-arm64",
  },
  {
    target: "windows-x64",
    os: "win32",
    cpu: "x64",
    binaryFilename: "yomi-bun-windows-x64-baseline.exe",
  },
  {
    target: "windows-arm64",
    os: "win32",
    cpu: "arm64",
    binaryFilename: "yomi-bun-windows-arm64.exe",
  },
];

assertStagedPackages();

const platform = expectedPlatforms.find(
  (candidate) => candidate.os === process.platform && candidate.cpu === process.arch,
);

if (!platform) {
  throw new Error(`No bundled yomi binary expected for ${process.platform}-${process.arch}`);
}

const tempRoot = mkdtempSync(join(tmpdir(), "yomi-packed-install-"));
const packRoot = join(tempRoot, "packs");
const appRoot = join(tempRoot, "app");

mkdirSync(packRoot, { recursive: true });
mkdirSync(appRoot, { recursive: true });

function run(command, args, cwd) {
  return runWithEnv(command, args, cwd, {});
}

function runWithEnv(command, args, cwd, env) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
    stdio: "pipe",
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed with status ${result.status}: ${command} ${args.join(" ")}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return result;
}

function npmPack(packageDir) {
  const result = run("npm", ["pack", packageDir, "--pack-destination", packRoot, "--json"], projectRoot);
  const packOutput = JSON.parse(result.stdout);
  const filename = packOutput[0]?.filename;

  if (typeof filename !== "string" || filename.length === 0) {
    throw new Error(`npm pack did not return a filename for ${packageDir}`);
  }

  return join(packRoot, filename);
}

function assertStagedPackages() {
  if (manifest.root.name !== cliPackageName) {
    throw new Error("Manifest root package name is inconsistent.");
  }

  const rootPackageJson = JSON.parse(
    readFileSync(join(stageRoot, manifest.root.dir, "package.json"), "utf8"),
  );
  if (rootPackageJson.name !== cliPackageName) {
    throw new Error(`Root package name mismatch: ${rootPackageJson.name}`);
  }
  if (rootPackageJson.optionalDependencies !== undefined) {
    throw new Error("CLI package should download platform binaries instead of optionalDependencies.");
  }

  for (const expected of expectedPlatforms) {
    const assetPath = join(stageRoot, manifest.assets.dir, `yomi-${expected.target}${expected.os === "win32" ? ".exe" : ""}`);
    if (!existsSync(assetPath)) {
      throw new Error(`Missing release asset for ${expected.target}`);
    }
  }
  if (!existsSync(join(stageRoot, manifest.assets.dir, "checksums.txt"))) {
    throw new Error("Missing release asset checksums.txt");
  }

  const runtimePackageJson = JSON.parse(
    readFileSync(join(stageRoot, manifest.runtime.dir, "package.json"), "utf8"),
  );
  if (runtimePackageJson.name !== runtimePackageName) {
    throw new Error(`Runtime package name mismatch: ${runtimePackageJson.name}`);
  }
  if (runtimePackageJson.bin !== undefined) {
    throw new Error("Runtime package should not expose a CLI bin.");
  }
}

const rootTarball = npmPack(join(stageRoot, manifest.root.dir));
const runtimeTarball = npmPack(join(stageRoot, manifest.runtime.dir));
const currentAssetPath = join(
  stageRoot,
  manifest.assets.dir,
  `yomi-${platform.target}${platform.os === "win32" ? ".exe" : ""}`,
);

writeFileSync(
  join(appRoot, "package.json"),
  JSON.stringify(
    {
      name: "yomi-packed-install-verification",
      private: true,
      type: "module",
    },
    null,
    2,
  ),
  "utf8",
);

runWithEnv(
  "npm",
  [
    "install",
    rootTarball,
    runtimeTarball,
    "--no-audit",
    "--no-fund",
    "--legacy-peer-deps",
  ],
  appRoot,
  {
    YOMI_BINARY_PATH: currentAssetPath,
  },
);

mkdirSync(join(appRoot, "node_modules"), { recursive: true });
symlinkSync(resolve(projectRoot, "node_modules/react"), join(appRoot, "node_modules/react"), "dir");
symlinkSync(resolve(projectRoot, "node_modules/@types"), join(appRoot, "node_modules/@types"), "dir");

const cliCheck = run(
  process.execPath,
  [join(appRoot, "node_modules/.bin/yomi"), "--help"],
  appRoot,
);

if (!cliCheck.stdout.includes("Agent-facing frontend development support layer")) {
  throw new Error("Packed CLI help output did not look like yomi.");
}

const npmExecCheck = run("npm", ["exec", "--", "yomi", "--help"], appRoot);

if (!npmExecCheck.stdout.includes("Agent-facing frontend development support layer")) {
  throw new Error("Packed CLI did not run through npm exec.");
}

const skillHelpCheck = run(
  process.execPath,
  [join(appRoot, "node_modules/.bin/yomi"), "skill", "--help"],
  appRoot,
);

if (!skillHelpCheck.stdout.includes("Manage agent skill installations")) {
  throw new Error("Packed CLI skill help output did not expose the Yomi skill installer.");
}

const skillInstallCheck = run(
  process.execPath,
  [join(appRoot, "node_modules/.bin/yomi"), "skill", "--all", "--scope", "project"],
  appRoot,
);

for (const skillName of ["yomi", "yomi-react-repair", "yomi-react-instrumentation"]) {
  const skillFile = join(appRoot, ".agents/skills", skillName, "SKILL.md");
  if (!existsSync(skillFile)) {
    throw new Error(`Packed CLI skill install did not write ${skillFile}.`);
  }
}

const doctorHelpCheck = run(
  process.execPath,
  [join(appRoot, "node_modules/.bin/yomi"), "doctor", "--help"],
  appRoot,
);

if (!doctorHelpCheck.stdout.includes("agent-facing concept contract")) {
  throw new Error("Packed CLI doctor help output did not expose the concept contract checker.");
}

const examplesHelpCheck = run(
  process.execPath,
  [join(appRoot, "node_modules/.bin/yomi"), "examples", "--help"],
  appRoot,
);

if (!examplesHelpCheck.stdout.includes("List example React repair tasks")) {
  throw new Error("Packed CLI examples help output did not expose the examples catalog.");
}

const errorCheck = spawnSync(
  process.execPath,
  [join(appRoot, "node_modules/.bin/yomi"), "explain", "not-last-failure"],
  {
    cwd: appRoot,
    encoding: "utf8",
    stdio: "pipe",
  },
);

if (errorCheck.status === 0) {
  throw new Error("Packed CLI invalid command unexpectedly succeeded.");
}
const errorOutput = JSON.parse(errorCheck.stdout);
if (
  errorOutput.ok !== false ||
  errorOutput.error?.message !== 'Unknown explanation subject "not-last-failure". Expected last-failure.'
) {
  throw new Error("Packed CLI invalid command did not return structured JSON error output.");
}
if (errorCheck.stderr.trim() !== "") {
  throw new Error("Packed CLI invalid command wrote stack output to stderr.");
}

const runtimeCheck = run(
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
  appRoot,
);

writeFileSync(
  join(appRoot, "consumer.ts"),
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

run(
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
  appRoot,
);

console.log(
  [
    `Verified packed install for ${cliPackageName} and ${runtimePackageName}.`,
    `  cli: ${basename(rootTarball)}`,
    `  runtime: ${basename(runtimeTarball)}`,
    `  platforms: ${expectedPlatforms.map((platform) => platform.target).join(", ")}`,
    `  checks: release assets, CLI postinstall, CLI bin, npm exec, JSON error output, yomi skill command/install, yomi doctor/examples commands, ${reactImport} runtime/type import, ${queryImport} runtime/type import`,
    skillInstallCheck.stdout.trim(),
    runtimeCheck.stdout.trim(),
  ]
    .filter(Boolean)
    .join("\n"),
);
