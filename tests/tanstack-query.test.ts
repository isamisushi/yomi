import { describe, expect, test } from "bun:test";

import {
  createYomiTanStackQueryClient,
  traceTanStackQueryOperation,
} from "../src/tanstack-query";
import { ensureYomiRuntimeTrace } from "../src/runtime-trace";

describe("TanStack Query instrumentation", () => {
  test("records source-linked invalidateQueries operations and calls the wrapped client", () => {
    const trace = ensureYomiRuntimeTrace();
    trace.clear();
    const calls: unknown[][] = [];
    const client = {
      invalidateQueries: (...args: unknown[]) => {
        calls.push(args);
        return "invalidated";
      },
    };

    const tracedClient = createYomiTanStackQueryClient(client, {
      invalidate: {
        name: "archive product cache",
        source: {
          file: "src/ProductArchivePanel.tsx",
          line: 24,
          symbol: "invalidateQueries",
        },
        graphNodeId: "product-archive-panel-invalidate-1-cache",
        correlationId: "cache-inconsistency",
      },
    });

    const result = tracedClient.invalidateQueries({ queryKey: ["products"], type: "active" });

    expect(result).toBe("invalidated");
    expect(calls).toEqual([[{ queryKey: ["products"], type: "active" }]]);
    expect(trace.getTrace()).toEqual([
      expect.objectContaining({
        kind: "state-committed",
        summary: "archive product cache invalidate [products].",
        source: {
          file: "src/ProductArchivePanel.tsx",
          line: 24,
          symbol: "invalidateQueries",
        },
        graphNodeId: "product-archive-panel-invalidate-1-cache",
        correlationId: "cache-inconsistency",
      }),
    ]);
  });

  test("records legacy array keys and setQueryData operations", () => {
    const trace = ensureYomiRuntimeTrace();
    trace.clear();
    const calls: unknown[][] = [];
    const client = {
      invalidateQueries: (...args: unknown[]) => {
        calls.push(args);
      },
      setQueryData: (...args: unknown[]) => {
        calls.push(args);
        return { id: "paper" };
      },
    };
    const tracedClient = createYomiTanStackQueryClient(client, {
      invalidate: {
        name: "legacy invalidate",
        graphNodeId: "legacy-cache",
      },
      setQueryData: {
        name: "write product cache",
        graphNodeId: "write-cache",
      },
    });

    tracedClient.invalidateQueries(["products"]);
    const nextProduct = tracedClient.setQueryData(["product", "paper"], { id: "paper" });

    expect(nextProduct).toEqual({ id: "paper" });
    expect(calls).toEqual([[["products"]], [["product", "paper"], { id: "paper" }]]);
    expect(trace.getTrace().map((event) => event.summary)).toEqual([
      "legacy invalidate invalidate [products].",
      "write product cache set-query-data [product, paper].",
    ]);
  });

  test("traceTanStackQueryOperation records all-query operations without a client", () => {
    const trace = ensureYomiRuntimeTrace();
    trace.clear();

    traceTanStackQueryOperation({
      metadata: {
        name: "manual refetch",
        graphNodeId: "manual-refetch-cache",
      },
      operation: "refetch",
    });

    expect(trace.getTrace()[0]).toMatchObject({
      kind: "state-committed",
      summary: "manual refetch refetch [all queries].",
      graphNodeId: "manual-refetch-cache",
    });
  });
});
