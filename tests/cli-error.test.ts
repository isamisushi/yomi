import { spawnSync } from "node:child_process";

import { describe, expect, test } from "bun:test";

describe("CLI JSON error boundary", () => {
  test("returns agent-readable JSON when a command throws", () => {
    const result = spawnSync("bun", ["src/cli.ts", "explain", "not-last-failure"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      error: {
        name: "Error",
        message: 'Unknown explanation subject "not-last-failure". Expected last-failure.',
      },
    });
  });

  test("returns structured filesystem errors without a stack trace", () => {
    const result = spawnSync("bun", ["src/cli.ts", "doctor", "--graph", "no-such.json"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    const parsed = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatchObject({
      name: "Error",
      code: "ENOENT",
    });
    expect(parsed.error.message).toContain("no-such.json");
    expect(result.stdout).not.toContain("at ");
  });
});
