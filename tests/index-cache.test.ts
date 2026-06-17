import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { writeProjectGraph } from "../src/cli-support";

describe("writeProjectGraph index cache", () => {
  test("reuses a cached graph until source files change", async () => {
    const projectPath = await createCacheFixtureProject("CachePanel");

    const first = await writeProjectGraph({
      outputPath: ".yomi/graph.json",
      projectPath,
    });
    const second = await writeProjectGraph({
      outputPath: ".yomi/graph.json",
      projectPath,
    });

    expect(first.cache.status).toBe("miss");
    expect(second.cache.status).toBe("hit");
    expect(second.cache.fingerprint).toBe(first.cache.fingerprint);
    expect(second.summary.components).toBe(1);

    await writeFile(
      join(projectPath, "src/CachePanel.tsx"),
      `
        export function CachePanel() {
          return <button>Changed</button>;
        }
      `,
      "utf8",
    );

    const third = await writeProjectGraph({
      outputPath: ".yomi/graph.json",
      projectPath,
    });

    expect(third.cache.status).toBe("miss");
    expect(third.cache.fingerprint).not.toBe(first.cache.fingerprint);
  });

  test("rebuilds when the cached graph uses an older schema version", async () => {
    const projectPath = await createCacheFixtureProject("VersionedCachePanel");

    const first = await writeProjectGraph({
      outputPath: ".yomi/graph.json",
      projectPath,
    });
    const cachePath = join(projectPath, ".yomi/index-cache.json");
    const cacheJson = JSON.parse(await readFile(cachePath, "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(
      cachePath,
      `${JSON.stringify(
        {
          ...cacheJson,
          version: "1",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const second = await writeProjectGraph({
      outputPath: ".yomi/graph.json",
      projectPath,
    });

    expect(first.cache.status).toBe("miss");
    expect(second.cache.status).toBe("miss");
    expect(second.cache.fingerprint).toBe(first.cache.fingerprint);
  });
});

async function createCacheFixtureProject(componentName: string): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "yomi-index-cache-"));
  await mkdir(join(projectPath, "src"), { recursive: true });
  await writeFile(
    join(projectPath, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          jsx: "react-jsx",
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ES2022",
        },
        include: ["src"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(projectPath, "src/CachePanel.tsx"),
    `
      export function ${componentName}() {
        return <button>Cache me</button>;
      }
    `,
    "utf8",
  );
  return projectPath;
}
