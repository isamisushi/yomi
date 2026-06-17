import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const npmStageRoot = resolve(projectRoot, ".crust/npm");
const stageRoot = resolve(projectRoot, ".crust/npm/root");
const packageJsonPath = resolve(stageRoot, "package.json");
const rootPackageName = "@isamisushi/yomi";
const platformPackageNames = {
  "linux-x64": "@isamisushi/yomi-linux-x64",
  "linux-arm64": "@isamisushi/yomi-linux-arm64",
  "darwin-x64": "@isamisushi/yomi-darwin-x64",
  "darwin-arm64": "@isamisushi/yomi-darwin-arm64",
  "windows-x64": "@isamisushi/yomi-windows-x64",
  "windows-arm64": "@isamisushi/yomi-windows-arm64",
};
const packageMetadata = {
  description: "Agent-facing React repair context for AI coding agents.",
  homepage: "https://yomi-docs.fly.dev/",
  repository: {
    type: "git",
    url: "git+https://github.com/isamisushi/yomi.git",
  },
  bugs: {
    url: "https://github.com/isamisushi/yomi/issues",
  },
  keywords: [
    "ai",
    "coding-agent",
    "react",
    "frontend",
    "debugging",
    "cli",
  ],
  publishConfig: {
    access: "public",
  },
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

mkdirSync(stageRoot, { recursive: true });
cpSync(resolve(projectRoot, "skills"), resolve(stageRoot, "skills"), {
  recursive: true,
});

run("bun", [
  "build",
  "src/react.ts",
  "--outfile",
  ".crust/npm/root/react.js",
  "--target",
  "browser",
  "--external",
  "react",
]);

run("bun", [
  "build",
  "src/tanstack-query.ts",
  "--outfile",
  ".crust/npm/root/tanstack-query.js",
  "--target",
  "browser",
]);

run("npx", [
  "tsc",
  "--ignoreConfig",
  "src/react.ts",
  "src/react-instrumentation.ts",
  "src/runtime-trace.ts",
  "src/tanstack-query.ts",
  "src/yomi-ir.ts",
  "--declaration",
  "--emitDeclarationOnly",
  "--outDir",
  ".crust/npm/root",
  "--module",
  "ESNext",
  "--moduleResolution",
  "Bundler",
  "--target",
  "ES2022",
  "--jsx",
  "react-jsx",
  "--skipLibCheck",
  "--strict",
]);

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const binPath = resolve(stageRoot, "bin/yomi.js");
const binSource = readFileSync(binPath, "utf8");
let patchedBinSource = binSource.replace(
    "const child = spawn(binPath, process.argv.slice(2), {\n\tstdio: \"inherit\",\n});",
    "const child = spawn(binPath, process.argv.slice(2), {\n\tstdio: \"inherit\",\n\tenv: {\n\t\t...process.env,\n\t\tYOMI_PACKAGE_ROOT: resolve(dir, \"..\"),\n\t},\n});",
);
for (const [target, scopedName] of Object.entries(platformPackageNames)) {
  const unscopedName = `yomi-${target}`;
  patchedBinSource = patchedBinSource.replaceAll(
    `"packageName": "${unscopedName}"`,
    `"packageName": "${scopedName}"`,
  );
}
writeFileSync(binPath, patchedBinSource, "utf8");
Object.assign(packageJson, packageMetadata, {
  name: rootPackageName,
});
packageJson.files = Array.from(
  new Set([
    ...(packageJson.files ?? []),
    "react.js",
    "tanstack-query.js",
    "*.d.ts",
    "skills",
  ]),
);
packageJson.exports = {
  "./react": {
    types: "./react.d.ts",
    import: "./react.js",
  },
  "./tanstack-query": {
    types: "./tanstack-query.d.ts",
    import: "./tanstack-query.js",
  },
};
packageJson.peerDependencies = {
  ...(packageJson.peerDependencies ?? {}),
  react: ">=18",
};
packageJson.optionalDependencies = Object.fromEntries(
  Object.entries(platformPackageNames).map(([target, packageName]) => [
    packageName,
    packageJson.version,
  ]),
);
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

const manifestPath = resolve(npmStageRoot, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.root.name = rootPackageName;
for (const packageInfo of manifest.packages) {
  const scopedName = platformPackageNames[packageInfo.target];
  if (scopedName === undefined) {
    throw new Error(`No scoped package name configured for ${packageInfo.target}`);
  }
  packageInfo.name = scopedName;
  const platformPackageJsonPath = resolve(npmStageRoot, packageInfo.dir, "package.json");
  const platformPackageJson = JSON.parse(readFileSync(platformPackageJsonPath, "utf8"));
  Object.assign(platformPackageJson, packageMetadata, {
    name: scopedName,
  });
  writeFileSync(
    platformPackageJsonPath,
    `${JSON.stringify(platformPackageJson, null, 2)}\n`,
    "utf8",
  );
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`, "utf8");
