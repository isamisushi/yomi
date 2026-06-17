import {
  useEffect,
  useRef,
  useState,
  type DependencyList,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  ensureYomiRuntimeTrace,
  recordRuntimeTrace,
  type RuntimeTraceInput,
} from "./runtime-trace";

let runtimeInstanceSequence = 0;

export type YomiTraceMetadata = Omit<RuntimeTraceInput, "kind" | "summary"> & {
  readonly name: string;
};

export type YomiTraceEffectOptions = {
  readonly clearBeforeRun?: boolean;
};

export type YomiExternalStoreUsageKind = "read" | "read-write" | "write";

export function createYomiAction<Args extends readonly unknown[]>(
  metadata: YomiTraceMetadata,
  handler: (...args: Args) => void,
): (...args: Args) => void {
  return (...args) => {
    recordRuntimeTrace({
      ...metadata,
      kind: "action-requested",
      summary: `${metadata.name} action requested.`,
    });
    handler(...args);
  };
}

export function traceYomiReduxAction<Result>(
  metadata: YomiTraceMetadata,
  dispatchAction: () => Result,
): Result {
  recordRuntimeTrace({
    ...metadata,
    kind: "action-requested",
    summary: `${metadata.name} Redux action dispatched.`,
  });
  return dispatchAction();
}

export function useYomiReduxSelectorTrace(
  metadata: YomiTraceMetadata,
  selectedPath: readonly string[],
): void {
  useEffect(() => {
    recordRuntimeTrace({
      ...metadata,
      kind: "state-committed",
      summary: `${metadata.name} Redux selector read ${selectedPath.join(".")}.`,
    });
  });
}

export function useYomiExternalStoreTrace(
  metadata: YomiTraceMetadata,
  storeName: string,
  selectedFields: readonly string[],
  usageKind: YomiExternalStoreUsageKind = "read",
): void {
  useEffect(() => {
    recordRuntimeTrace({
      ...metadata,
      kind: "state-committed",
      summary: formatYomiExternalStoreTraceSummary({
        fieldNames: selectedFields,
        metadataName: metadata.name,
        storeName,
        usageKind,
      }),
    });
  });
}

export function formatYomiExternalStoreTraceSummary(input: {
  readonly fieldNames: readonly string[];
  readonly metadataName: string;
  readonly storeName: string;
  readonly usageKind: YomiExternalStoreUsageKind;
}): string {
  const fieldSummary =
    input.fieldNames.length === 0 ? "whole store" : input.fieldNames.join(", ");
  const verb =
    input.usageKind === "read-write"
      ? "read/write"
      : input.usageKind === "write"
        ? "write"
        : "read";
  return `${input.metadataName} external store ${input.storeName} ${verb} ${fieldSummary}.`;
}

export function useYomiFormFieldTrace(
  metadata: YomiTraceMetadata,
  fieldName: string,
  evidenceKind: "error" | "field" | "validation",
): void {
  useEffect(() => {
    recordRuntimeTrace({
      ...metadata,
      kind: "state-committed",
      summary: `${metadata.name} form ${evidenceKind} owns ${fieldName}.`,
    });
  });
}

export function traceYomiRouterRefresh<Result>(
  metadata: YomiTraceMetadata,
  refresh: () => Result,
): Result {
  recordRuntimeTrace({
    ...metadata,
    kind: "action-requested",
    summary: `${metadata.name} requested router.refresh().`,
  });
  return refresh();
}

export function useYomiTraceEffect(
  metadata: YomiTraceMetadata,
  effect: () => void | (() => void),
  deps: DependencyList,
  options: YomiTraceEffectOptions = {},
): void {
  useEffect(() => {
    if (options.clearBeforeRun === true) {
      ensureYomiRuntimeTrace().clear();
    }
    recordRuntimeTrace({
      ...metadata,
      kind: "effect-ran",
      summary: `${metadata.name} effect ran.`,
    });
    const cleanup = effect();
    return () => {
      recordRuntimeTrace({
        ...metadata,
        kind: "cleanup-ran",
        summary: `${metadata.name} cleanup ran.`,
      });
      cleanup?.();
    };
  }, deps);
}

export function useYomiRenderTrace(
  metadata: YomiTraceMetadata,
  getSummary: () => string,
  deps?: DependencyList,
): void {
  const runtimeInstanceIdRef = useRef<string | undefined>(undefined);
  if (runtimeInstanceIdRef.current === undefined) {
    runtimeInstanceSequence += 1;
    runtimeInstanceIdRef.current = `${metadata.graphNodeId ?? metadata.name}-instance-${runtimeInstanceSequence}`;
  }

  useEffect(() => {
    const runtimeInstanceId = runtimeInstanceIdRef.current;
    recordRuntimeTrace({
      ...metadata,
      kind: "component-mounted",
      runtimeInstanceId,
      summary: `${metadata.name} component mounted.`,
    });
    return () => {
      recordRuntimeTrace({
        ...metadata,
        kind: "component-unmounted",
        runtimeInstanceId,
        summary: `${metadata.name} component unmounted.`,
      });
    };
  }, []);

  useEffect(() => {
    recordRuntimeTrace({
      ...metadata,
      kind: "render-committed",
      runtimeInstanceId: runtimeInstanceIdRef.current,
      summary: getSummary(),
    });
  }, deps);
}

export function useYomiTracedState<T>(
  metadata: YomiTraceMetadata,
  initialState: T | (() => T),
): readonly [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initialState);

  useEffect(() => {
    recordRuntimeTrace({
      ...metadata,
      kind: "state-committed",
      summary: `${metadata.name} state committed.`,
    });
  }, [metadata, value]);

  const setTracedValue: Dispatch<SetStateAction<T>> = (nextValue) => {
    recordRuntimeTrace({
      ...metadata,
      kind: "state-update-requested",
      summary: `${metadata.name} state update requested.`,
    });
    setValue(nextValue);
  };

  return [value, setTracedValue];
}
