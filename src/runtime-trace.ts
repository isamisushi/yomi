import type { SourceLocation, TraceEvent } from "./yomi-ir";

export type RuntimeTraceInput = {
  readonly kind: TraceEvent["kind"];
  readonly summary: string;
  readonly source?: SourceLocation;
  readonly graphNodeId?: string;
  readonly correlationId?: string;
  readonly runtimeInstanceId?: string;
};

export type YomiRuntimeTraceApi = {
  readonly clear: () => void;
  readonly getTrace: () => readonly TraceEvent[];
  readonly record: (event: RuntimeTraceInput) => TraceEvent;
};

declare global {
  interface Window {
    __YOMI_TRACE__?: YomiRuntimeTraceApi;
  }
}

let sequence = 0;
const trace: TraceEvent[] = [];

export function ensureYomiRuntimeTrace(): YomiRuntimeTraceApi {
  if (typeof window === "undefined") {
    return runtimeTraceApi;
  }

  window.__YOMI_TRACE__ = window.__YOMI_TRACE__ ?? runtimeTraceApi;
  return window.__YOMI_TRACE__;
}

export function recordRuntimeTrace(event: RuntimeTraceInput): TraceEvent {
  return ensureYomiRuntimeTrace().record(event);
}

const runtimeTraceApi: YomiRuntimeTraceApi = {
  clear: () => {
    trace.length = 0;
    sequence = 0;
  },
  getTrace: () => trace.map((event) => ({ ...event })),
  record: (event) => {
    sequence += 1;
    const nextEvent: TraceEvent = {
      id: `runtime-${sequence}`,
      at: formatRuntimeTimestamp(),
      kind: event.kind,
      summary: event.summary,
      source: event.source,
      graphNodeId: event.graphNodeId,
      correlationId: event.correlationId,
      runtimeInstanceId: event.runtimeInstanceId,
    };
    trace.push(nextEvent);
    return nextEvent;
  },
};

function formatRuntimeTimestamp(): string {
  if (typeof performance === "undefined") {
    return `runtime:${sequence}`;
  }
  return `runtime:${Math.round(performance.now())}`;
}
