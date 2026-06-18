import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const stageRoot = resolve(projectRoot, ".crust/npm");
const manifest = JSON.parse(readFileSync(join(stageRoot, "manifest.json"), "utf8"));
const dryRun = process.argv.includes("--dry-run");

const packages = [
  {
    name: manifest.runtime.name,
    dir: manifest.runtime.dir,
  },
  {
    name: manifest.root.name,
    dir: manifest.root.dir,
  },
];

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
