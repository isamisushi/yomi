import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const stageRoot = resolve(projectRoot, ".crust/npm");
const manifest = JSON.parse(readFileSync(join(stageRoot, "manifest.json"), "utf8"));
const dryRun = process.argv.includes("--dry-run");
const packageFlagIndex = process.argv.indexOf("--package");
const selectedPackage =
  packageFlagIndex === -1 ? "all" : process.argv[packageFlagIndex + 1];

const packages = [
  {
    id: "runtime",
    name: manifest.runtime.name,
    dir: manifest.runtime.dir,
  },
  {
    id: "cli",
    name: manifest.root.name,
    dir: manifest.root.dir,
  },
].filter((packageInfo) => selectedPackage === "all" || packageInfo.id === selectedPackage);

if (!["all", "runtime", "cli"].includes(selectedPackage) || packages.length === 0) {
  throw new Error('Expected --package to be one of "all", "runtime", or "cli".');
}

for (const packageInfo of packages) {
  const args = [
    "publish",
    join(stageRoot, packageInfo.dir),
    "--access",
    "public",
  ];
  if (dryRun) {
    args.push("--dry-run");
  }

  console.log(`Publishing ${packageInfo.name}${dryRun ? " (dry-run)" : ""}...`);
  const result = spawnSync("npm", args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed with status ${result.status}`);
  }
}
