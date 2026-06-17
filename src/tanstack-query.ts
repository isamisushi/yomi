import { recordRuntimeTrace, type RuntimeTraceInput } from "./runtime-trace";
import type { SourceLocation, TraceEvent } from "./yomi-ir";

export type YomiQueryKey = readonly unknown[];

export type YomiQueryTraceMetadata = Omit<RuntimeTraceInput, "kind" | "summary"> & {
  readonly name: string;
  readonly source?: SourceLocation;
};

export type YomiQueryClientTraceOptions = {
  readonly invalidate?: YomiQueryTraceMetadata;
  readonly refetch?: YomiQueryTraceMetadata;
  readonly setQueryData?: YomiQueryTraceMetadata;
};

export type TraceableTanStackQueryClient = {
  readonly invalidateQueries?: unknown;
  readonly refetchQueries?: unknown;
  readonly setQueryData?: unknown;
};

type QueryClientMethod<TMethod> = TMethod extends (...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : (...args: readonly unknown[]) => unknown;

export type TracedTanStackQueryClient<TClient extends TraceableTanStackQueryClient> =
  Omit<TClient, "invalidateQueries" | "refetchQueries" | "setQueryData"> & {
    readonly invalidateQueries: QueryClientMethod<TClient["invalidateQueries"]>;
    readonly refetchQueries: QueryClientMethod<TClient["refetchQueries"]>;
    readonly setQueryData: QueryClientMethod<TClient["setQueryData"]>;
  };

export function createYomiTanStackQueryClient<TClient extends TraceableTanStackQueryClient>(
  client: TClient,
  options: YomiQueryClientTraceOptions,
): TracedTanStackQueryClient<TClient> {
  const tracedClient = {
    ...client,
    invalidateQueries: traceQueryClientMethod({
      client,
      fallback: () => undefined,
      getQueryKey: (args) => getQueryKeyFromFilterArgument(args[0]),
      metadata: options.invalidate,
      methodName: "invalidateQueries",
      operation: "invalidate",
    }),
    refetchQueries: traceQueryClientMethod({
      client,
      fallback: () => undefined,
      getQueryKey: (args) => getQueryKeyFromFilterArgument(args[0]),
      metadata: options.refetch,
      methodName: "refetchQueries",
      operation: "refetch",
    }),
    setQueryData: traceQueryClientMethod({
      client,
      fallback: () => undefined,
      getQueryKey: (args) => normalizeQueryKey(args[0]),
      metadata: options.setQueryData,
      methodName: "setQueryData",
      operation: "set-query-data",
    }),
  };
  return tracedClient as TracedTanStackQueryClient<TClient>;
}

export function traceTanStackQueryOperation(input: {
  readonly metadata: YomiQueryTraceMetadata;
  readonly operation: "invalidate" | "refetch" | "set-query-data";
  readonly queryKey?: readonly unknown[];
}): TraceEvent {
  return recordRuntimeTrace({
    ...input.metadata,
    kind: "state-committed",
    summary: `${input.metadata.name} ${input.operation} ${formatQueryKey(input.queryKey)}.`,
  });
}

function traceQueryClientMethod<TClient extends TraceableTanStackQueryClient>(input: {
  readonly client: TClient;
  readonly fallback: (...args: readonly unknown[]) => unknown;
  readonly getQueryKey: (args: readonly unknown[]) => readonly unknown[] | undefined;
  readonly metadata?: YomiQueryTraceMetadata;
  readonly methodName: keyof TraceableTanStackQueryClient;
  readonly operation: "invalidate" | "refetch" | "set-query-data";
}): (...args: readonly unknown[]) => unknown {
  const method = getCallableMethod(input.client[input.methodName]) ?? input.fallback;
  return (...args: readonly unknown[]) => {
    const queryKey = input.getQueryKey(args);
    if (input.metadata !== undefined) {
      traceTanStackQueryOperation({
        metadata: input.metadata,
        operation: input.operation,
        queryKey,
      });
    }
    return method.apply(input.client, [...args]);
  };
}

function getCallableMethod(input: unknown): ((...args: readonly unknown[]) => unknown) | undefined {
  return typeof input === "function"
    ? ((...args: readonly unknown[]) => input(...args))
    : undefined;
}

function getQueryKeyFromFilterArgument(input: unknown): readonly unknown[] | undefined {
  if (Array.isArray(input)) {
    return input;
  }
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  return normalizeQueryKey((input as Readonly<Record<string, unknown>>).queryKey);
}

function normalizeQueryKey(input: unknown): readonly unknown[] | undefined {
  return Array.isArray(input) ? input : undefined;
}

function formatQueryKey(queryKey: readonly unknown[] | undefined): string {
  if (queryKey === undefined) {
    return "[all queries]";
  }
  return `[${queryKey.map(formatQueryKeyPart).join(", ")}]`;
}

function formatQueryKeyPart(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  return JSON.stringify(value);
}
