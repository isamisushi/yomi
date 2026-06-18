import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const npmStageRoot = resolve(projectRoot, ".crust/npm");
const cliStageRoot = resolve(npmStageRoot, "root");
const runtimeStageRoot = resolve(npmStageRoot, "runtime");
const assetsRoot = resolve(npmStageRoot, "assets");
const packageJsonPath = resolve(cliStageRoot, "package.json");
const cliPackageName = "@isamisushi/yomi-cli";
const runtimePackageName = "@isamisushi/yomi";
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
const runtimePackageMetadata = {
  ...packageMetadata,
  description: "React runtime instrumentation adapters for Yomi.",
  keywords: [
    "ai",
    "coding-agent",
    "react",
    "instrumentation",
    "debugging",
  ],
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

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

mkdirSync(cliStageRoot, { recursive: true });
rmSync(runtimeStageRoot, { recursive: true, force: true });
rmSync(assetsRoot, { recursive: true, force: true });
mkdirSync(runtimeStageRoot, { recursive: true });
mkdirSync(assetsRoot, { recursive: true });
cpSync(resolve(projectRoot, "skills"), resolve(cliStageRoot, "skills"), {
  recursive: true,
});

run("bun", [
  "build",
  "src/react.ts",
  "--outfile",
  ".crust/npm/runtime/react.js",
  "--target",
  "browser",
  "--external",
  "react",
]);

run("bun", [
  "build",
  "src/tanstack-query.ts",
  "--outfile",
  ".crust/npm/runtime/tanstack-query.js",
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
  ".crust/npm/runtime",
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
const manifestPath = resolve(npmStageRoot, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const platforms = Object.fromEntries(
  manifest.packages.map((packageInfo) => {
    const extension = packageInfo.os === "win32" ? ".exe" : "";
    const assetName = `yomi-${packageInfo.target}${extension}`;
    const sourceBinaryPath = resolve(npmStageRoot, packageInfo.dir, packageInfo.bin);
    const assetPath = resolve(assetsRoot, assetName);
    cpSync(sourceBinaryPath, assetPath);
    if (packageInfo.os !== "win32") {
      chmodSync(assetPath, 0o755);
    }
    return [
      `${packageInfo.os}-${packageInfo.cpu}`,
      {
        target: packageInfo.target,
        assetName,
        checksum: sha256(assetPath),
      },
    ];
  }),
);
const checksums = Object.values(platforms)
  .map((platform) => `${platform.checksum}  ${platform.assetName}`)
  .join("\n");
writeFileSync(resolve(assetsRoot, "checksums.txt"), `${checksums}\n`, "utf8");

const binPath = resolve(cliStageRoot, "bin/yomi.js");
writeFileSync(
  binPath,
  `#!/usr/bin/env node
import { spawn } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PLATFORMS = ${JSON.stringify(platforms, null, "\t")};
const dir = dirname(fileURLToPath(import.meta.url));
const platformKey = \`\${process.platform}-\${process.arch}\`;
const target = PLATFORMS[platformKey];

if (!target) {
\tconsole.error("[yomi] Unsupported platform: " + platformKey);
\tconsole.error("[yomi] Supported platforms: " + Object.keys(PLATFORMS).join(", "));
\tprocess.exit(1);
}

const binPath = process.env.YOMI_BINARY_PATH || resolve(dir, "vendor", process.platform === "win32" ? "yomi.exe" : "yomi");

if (!existsSync(binPath)) {
\tconsole.error("[yomi] Missing Yomi binary for " + platformKey);
\tconsole.error("[yomi] Expected: " + binPath);
\tconsole.error("[yomi] Reinstall @isamisushi/yomi-cli or run with YOMI_BINARY_PATH=/path/to/yomi.");
\tprocess.exit(1);
}

if (process.platform !== "win32") {
\ttry {
\t\tchmodSync(binPath, 0o755);
\t} catch {
\t\t// Ignore permission adjustment failures and let spawn surface real errors.
\t}
}

const child = spawn(binPath, process.argv.slice(2), {
\tstdio: "inherit",
\tenv: {
\t\t...process.env,
\t\tYOMI_PACKAGE_ROOT: resolve(dir, ".."),
\t},
});

child.on("error", (error) => {
\tconsole.error("[yomi] Failed to launch binary: " + error.message);
\tprocess.exit(1);
});

child.on("exit", (code, signal) => {
\tif (signal) {
\t\ttry {
\t\t\tprocess.kill(process.pid, signal);
\t\t} catch {
\t\t\tprocess.exit(1);
\t\t}
\t\treturn;
\t}

\tprocess.exit(code ?? 0);
});
`,
  "utf8",
);

writeFileSync(
  resolve(cliStageRoot, "install.js"),
  `#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { get } from "node:https";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PLATFORMS = ${JSON.stringify(platforms, null, "\t")};
const dir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(dir);
const vendorDir = resolve(packageRoot, "bin", "vendor");
const platformKey = \`\${process.platform}-\${process.arch}\`;
const target = PLATFORMS[platformKey];

if (process.env.YOMI_SKIP_DOWNLOAD === "1") {
\tconsole.log("[yomi] Skipping binary download because YOMI_SKIP_DOWNLOAD=1.");
\tprocess.exit(0);
}

if (!target) {
\tconsole.error("[yomi] Unsupported platform: " + platformKey);
\tconsole.error("[yomi] Supported platforms: " + Object.keys(PLATFORMS).join(", "));
\tprocess.exit(1);
}

mkdirSync(vendorDir, { recursive: true });
const destination = resolve(vendorDir, process.platform === "win32" ? "yomi.exe" : "yomi");

if (process.env.YOMI_BINARY_PATH) {
\tcopyLocalBinary(process.env.YOMI_BINARY_PATH, destination);
\tverifyChecksum(destination, target.checksum);
\tconsole.log("[yomi] Installed binary from YOMI_BINARY_PATH.");
\tprocess.exit(0);
}

const version = "${packageJson.version}";
const baseUrl = process.env.YOMI_RELEASE_BASE_URL || \`https://github.com/isamisushi/yomi/releases/download/v\${version}\`;
const url = \`\${baseUrl}/\${target.assetName}\`;

download(url, destination)
\t.then(() => {
\t\tverifyChecksum(destination, target.checksum);
\t\tconsole.log(\`[yomi] Installed \${target.assetName}.\`);
\t})
\t.catch((error) => {
\t\tconsole.error("[yomi] Failed to install binary: " + error.message);
\t\tconsole.error("[yomi] Set YOMI_BINARY_PATH=/path/to/yomi to use a local binary, or YOMI_SKIP_DOWNLOAD=1 to skip download.");
\t\tprocess.exit(1);
\t});

function copyLocalBinary(source, destinationPath) {
\tconst content = readFileSync(source);
\twriteBinary(destinationPath, content);
}

function verifyChecksum(path, expected) {
\tconst actual = createHash("sha256").update(readFileSync(path)).digest("hex");
\tif (actual !== expected) {
\t\ttry {
\t\t\tunlinkSync(path);
\t\t} catch {}
\t\tthrow new Error(\`Checksum mismatch for \${target.assetName}: expected \${expected}, got \${actual}\`);
\t}
}

function writeBinary(path, content) {
\tconst tempPath = \`\${path}.tmp-\${process.pid}\`;
\twriteFileSync(tempPath, content, { mode: 0o755 });
\trenameSync(tempPath, path);
}

function download(url, destinationPath, redirects = 0) {
\treturn new Promise((resolvePromise, rejectPromise) => {
\t\tconst request = get(url, (response) => {
\t\t\tif ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
\t\t\t\tresponse.resume();
\t\t\t\tif (!response.headers.location || redirects > 5) {
\t\t\t\t\trejectPromise(new Error("Too many redirects while downloading " + url));
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t\tdownload(response.headers.location, destinationPath, redirects + 1).then(resolvePromise, rejectPromise);
\t\t\t\treturn;
\t\t\t}

\t\t\tif (response.statusCode !== 200) {
\t\t\t\tresponse.resume();
\t\t\t\trejectPromise(new Error(\`HTTP \${response.statusCode} for \${url}\`));
\t\t\t\treturn;
\t\t\t}

\t\t\tconst tempPath = \`\${destinationPath}.tmp-\${process.pid}\`;
\t\t\tconst file = createWriteStream(tempPath, { mode: 0o755 });
\t\t\tresponse.pipe(file);
\t\t\tfile.on("finish", () => {
\t\t\t\tfile.close(() => {
\t\t\t\t\trenameSync(tempPath, destinationPath);
\t\t\t\t\tresolvePromise();
\t\t\t\t});
\t\t\t});
\t\t\tfile.on("error", (error) => {
\t\t\t\ttry {
\t\t\t\t\tunlinkSync(tempPath);
\t\t\t\t} catch {}
\t\t\t\trejectPromise(error);
\t\t\t});
\t\t});
\t\trequest.on("error", rejectPromise);
\t});
}
`,
  "utf8",
);

Object.assign(packageJson, packageMetadata, {
  name: cliPackageName,
});
packageJson.files = Array.from(
  new Set([
    "bin",
    "install.js",
    "skills",
  ]),
);
packageJson.scripts = {
  postinstall: "node install.js",
};
delete packageJson.optionalDependencies;
delete packageJson.exports;
delete packageJson.peerDependencies;
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

const runtimePackageJson = {
  name: runtimePackageName,
  version: packageJson.version,
  license: packageJson.license ?? "MIT",
  type: "module",
  files: [
    "react.js",
    "tanstack-query.js",
    "*.d.ts",
  ],
  exports: {
    "./react": {
      types: "./react.d.ts",
      import: "./react.js",
    },
    "./tanstack-query": {
      types: "./tanstack-query.d.ts",
      import: "./tanstack-query.js",
    },
  },
  peerDependencies: {
    react: ">=18",
  },
  ...runtimePackageMetadata,
};
writeFileSync(
  resolve(runtimeStageRoot, "package.json"),
  `${JSON.stringify(runtimePackageJson, null, 2)}\n`,
  "utf8",
);

manifest.root.name = cliPackageName;
manifest.runtime = {
  name: runtimePackageName,
  dir: "runtime",
};
manifest.assets = {
  dir: "assets",
  files: [...Object.values(platforms).map((platform) => platform.assetName), "checksums.txt"],
};
manifest.packages = [];
manifest.publishOrder = ["runtime", "root"];
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`, "utf8");
