export type SourceLocation = {
  readonly file: string;
  readonly line: number;
  readonly symbol: string;
};

export type ComponentNode = {
  readonly id: string;
  readonly name: string;
  readonly role: "route" | "component" | "design-system" | "external-package";
  readonly runtime: "client" | "server" | "unknown";
  readonly packageEntry?: ComponentPackageEntry;
  readonly routeSegment?: RouteSegmentNode;
  readonly source: SourceLocation;
  readonly ownsState: readonly string[];
  readonly usesHooks: readonly string[];
  readonly renders: readonly string[];
};

export type ComponentPackageEntry = {
  readonly packageName: string;
  readonly moduleSpecifier: string;
  readonly importName: string;
  readonly entry: string;
  readonly clientEntry: boolean;
};

export type RouteSegmentNode = {
  readonly kind: "error" | "layout" | "loading" | "not-found" | "page" | "template";
  readonly path: string;
};

export type ComponentRenderEdgeNode = {
  readonly id: string;
  readonly ownerComponentId: string;
  readonly childComponentId: string;
  readonly kind: "render" | "server-to-client-boundary";
  readonly suspenseBoundary?: ComponentSuspenseBoundary;
  readonly serializationRisks?: readonly ComponentPropSerializationRisk[];
  readonly source: SourceLocation;
  readonly note: string;
};

export type DesignSystemUsageNode = {
  readonly id: string;
  readonly ownerComponentId: string;
  readonly componentId: string;
  readonly componentName: string;
  readonly props: readonly string[];
  readonly source: SourceLocation;
  readonly note: string;
};

export type PropNode = {
  readonly id: string;
  readonly ownerComponentId: string;
  readonly targetComponentId: string;
  readonly propName: string;
  readonly kind: "event-handler" | "spread" | "value";
  readonly value: string;
  readonly references: readonly string[];
  readonly viaSpread?: string;
  readonly source: SourceLocation;
  readonly note: string;
};

export type ContextUsageNode = {
  readonly id: string;
  readonly ownerComponentId: string;
  readonly contextName: string;
  readonly hookName: string;
  readonly source: SourceLocation;
  readonly providerSource?: SourceLocation;
  readonly note: string;
};

export type ExternalStoreUsageNode = {
  readonly id: string;
  readonly ownerComponentId: string;
  readonly storeName: string;
  readonly hookName: string;
  readonly selector: string;
  readonly selectedFields: readonly string[];
  readonly selectedSources: readonly ExternalStoreSelectionSource[];
  readonly source: SourceLocation;
  readonly storeSource?: SourceLocation;
  readonly usageKind: "read" | "read-write" | "write";
  readonly note: string;
};

export type ExternalStoreSelectionSource = {
  readonly fieldName: string;
  readonly source: SourceLocation;
};

export type ReduxActionUsageNode = {
  readonly id: string;
  readonly ownerComponentId: string;
  readonly actionName: string;
  readonly sliceName: string;
  readonly dispatchSource: SourceLocation;
  readonly actionSource?: SourceLocation;
  readonly reducerSource?: SourceLocation;
  readonly note: string;
};

export type ReduxSelectorUsageNode = {
  readonly id: string;
  readonly ownerComponentId: string;
  readonly hookName: string;
  readonly selector: string;
  readonly selectedPath: readonly string[];
  readonly selectedSource?: SourceLocation;
  readonly source: SourceLocation;
  readonly note: string;
};

export type ComponentSuspenseBoundary = {
  readonly kind: "manual";
  readonly fallback: string;
  readonly source: SourceLocation;
  readonly note: string;
};

export type ComponentPropSerializationRisk = {
  readonly propName: string;
  readonly kind:
    | "function"
    | "class-instance"
    | "object-with-function"
    | "object-with-class-instance"
    | "object-with-unknown-expression"
    | "unknown-expression";
  readonly source: SourceLocation;
  readonly note: string;
};

export type StateNode = {
  readonly id: string;
  readonly name: string;
  readonly ownerComponentId: string;
  readonly kind: "local" | "derived" | "remote";
  readonly source: SourceLocation;
};

export type HookNode = {
  readonly id: string;
  readonly name: string;
  readonly ownerComponentId: string;
  readonly kind: "state" | "effect" | "custom";
  readonly dependencies: readonly string[];
  readonly cleanup?: EffectCleanupEvidence;
  readonly source: SourceLocation;
  readonly risk: "low" | "medium" | "high";
  readonly note: string;
};

export type EffectCleanupEvidence = {
  readonly kind: "cleanup-present" | "missing-cleanup-risk";
  readonly resources: readonly string[];
  readonly source: SourceLocation;
  readonly note: string;
};

export type ActionNode = {
  readonly id: string;
  readonly name: string;
  readonly ownerComponentId: string;
  readonly source: SourceLocation;
  readonly implementationSource?: SourceLocation;
  readonly touchesState: readonly string[];
  readonly triggersHooks: readonly string[];
  readonly externalStoreUsages?: readonly string[];
  readonly reduxActionUsages?: readonly string[];
  readonly network: readonly string[];
};

export type UiNode = {
  readonly id: string;
  readonly label: string;
  readonly role: "button" | "input" | "status" | "panel" | "form" | "dialog";
  readonly componentId: string;
  readonly actionId?: string;
  readonly stateIds: readonly string[];
  readonly source: SourceLocation;
};

export type RemoteDataNode = {
  readonly id: string;
  readonly ownerComponentId: string;
  readonly kind: "fetch" | "next-fetch" | "react-query" | "swr";
  readonly key: readonly string[];
  readonly endpoint?: string;
  readonly source: SourceLocation;
  readonly risk: "low" | "medium" | "high";
  readonly note: string;
};

export type CacheOperationNode = {
  readonly id: string;
  readonly ownerActionId?: string;
  readonly ownerComponentId: string;
  readonly kind:
    | "invalidate"
    | "mutate"
    | "refetch"
    | "revalidate-path"
    | "revalidate-tag"
    | "set-query-data"
    | "update-tag";
  readonly policy?: CacheOperationPolicy;
  readonly targetKey: readonly string[];
  readonly trigger?: CacheOperationTrigger;
  readonly source: SourceLocation;
};

export type CacheOperationPolicy = {
  readonly kind: "optimistic-update";
  readonly options: readonly CacheOperationPolicyOption[];
  readonly source: SourceLocation;
};

export type CacheOperationPolicyOption = {
  readonly name: "optimisticData" | "populateCache" | "revalidate" | "rollbackOnError";
  readonly value: string;
};

export type CacheOperationTrigger = {
  readonly kind: "mutation-error" | "mutation-settled" | "mutation-success";
  readonly reference: string;
  readonly source: SourceLocation;
};

export type FormFieldNode = {
  readonly id: string;
  readonly name: string;
  readonly ownerComponentId: string;
  readonly stateId?: string;
  readonly register?: SourceLocation;
  readonly validation?: FormFieldValidation;
  readonly errors: readonly FormFieldErrorSource[];
};

export type FormFieldValidation = {
  readonly options: readonly FormFieldValidationOption[];
  readonly source: SourceLocation;
};

export type FormFieldValidationOption = {
  readonly name: "maxLength" | "minLength" | "pattern" | "required" | "validate";
  readonly value: string;
};

export type FormFieldErrorSource = {
  readonly kind: "read" | "set";
  readonly reference: string;
  readonly source: SourceLocation;
};

export type TraceEvent = {
  readonly id: string;
  readonly at: string;
  readonly kind:
    | "action-requested"
    | "cleanup-ran"
    | "component-mounted"
    | "component-remounted"
    | "component-unmounted"
    | "effect-ran"
    | "handler-invoked"
    | "request-started"
    | "render-committed"
    | "response-resolved"
    | "state-update-requested"
    | "state-committed"
    | "violation-detected";
  readonly summary: string;
  readonly source?: SourceLocation;
  readonly graphNodeId?: string;
  readonly correlationId?: string;
  readonly runtimeInstanceId?: string;
};

export type YomiGraph = {
  readonly components: readonly ComponentNode[];
  readonly renderEdges: readonly ComponentRenderEdgeNode[];
  readonly states: readonly StateNode[];
  readonly hooks: readonly HookNode[];
  readonly actions: readonly ActionNode[];
  readonly ui: readonly UiNode[];
  readonly remoteData: readonly RemoteDataNode[];
  readonly cacheOperations: readonly CacheOperationNode[];
  readonly formFields: readonly FormFieldNode[];
  readonly designSystemUsages: readonly DesignSystemUsageNode[];
  readonly props: readonly PropNode[];
  readonly contextUsages: readonly ContextUsageNode[];
  readonly externalStoreUsages: readonly ExternalStoreUsageNode[];
  readonly reduxActionUsages: readonly ReduxActionUsageNode[];
  readonly reduxSelectorUsages: readonly ReduxSelectorUsageNode[];
};

export type QueryResult = {
  readonly query: string;
  readonly summary: string;
  readonly nodes: readonly {
    readonly label: string;
    readonly detail: string;
    readonly source: SourceLocation;
  }[];
};

const graphArrayFields = [
  "components",
  "renderEdges",
  "states",
  "hooks",
  "actions",
  "ui",
  "remoteData",
  "cacheOperations",
  "formFields",
  "designSystemUsages",
  "props",
  "contextUsages",
  "externalStoreUsages",
  "reduxActionUsages",
  "reduxSelectorUsages",
] as const satisfies readonly (keyof YomiGraph)[];

const externalStoreUsageKinds = new Set(["read", "read-write", "write"]);

export function parseYomiGraph(input: unknown, sourceName = "Yomi graph"): YomiGraph {
  if (!isRecord(input)) {
    throw new Error(`${sourceName} must be a JSON object.`);
  }

  for (const field of graphArrayFields) {
    readGraphArrayField(input, field, sourceName);
  }

  return {
    components: readGraphArrayField(input, "components", sourceName) as readonly ComponentNode[],
    renderEdges: readGraphArrayField(
      input,
      "renderEdges",
      sourceName,
    ) as readonly ComponentRenderEdgeNode[],
    states: readGraphArrayField(input, "states", sourceName) as readonly StateNode[],
    hooks: readGraphArrayField(input, "hooks", sourceName) as readonly HookNode[],
    actions: readGraphArrayField(input, "actions", sourceName) as readonly ActionNode[],
    ui: readGraphArrayField(input, "ui", sourceName) as readonly UiNode[],
    remoteData: readGraphArrayField(
      input,
      "remoteData",
      sourceName,
    ) as readonly RemoteDataNode[],
    cacheOperations: readGraphArrayField(
      input,
      "cacheOperations",
      sourceName,
    ) as readonly CacheOperationNode[],
    formFields: readGraphArrayField(
      input,
      "formFields",
      sourceName,
    ) as readonly FormFieldNode[],
    designSystemUsages: readGraphArrayField(
      input,
      "designSystemUsages",
      sourceName,
    ) as readonly DesignSystemUsageNode[],
    props: readGraphArrayField(input, "props", sourceName) as readonly PropNode[],
    contextUsages: readGraphArrayField(
      input,
      "contextUsages",
      sourceName,
    ) as readonly ContextUsageNode[],
    externalStoreUsages: normalizeExternalStoreUsages(
      readGraphArrayField(input, "externalStoreUsages", sourceName),
      sourceName,
    ),
    reduxActionUsages: readGraphArrayField(
      input,
      "reduxActionUsages",
      sourceName,
    ) as readonly ReduxActionUsageNode[],
    reduxSelectorUsages: readGraphArrayField(
      input,
      "reduxSelectorUsages",
      sourceName,
    ) as readonly ReduxSelectorUsageNode[],
  };
}

function readGraphArrayField(
  input: Record<string, unknown>,
  field: (typeof graphArrayFields)[number],
  sourceName: string,
): readonly unknown[] {
  const value = input[field];
  if (!Array.isArray(value)) {
    throw new Error(`${sourceName}.${field} must be an array.`);
  }
  return value;
}

function normalizeExternalStoreUsages(
  usages: readonly unknown[],
  sourceName: string,
): readonly ExternalStoreUsageNode[] {
  return usages.map((usage, index) => {
    if (!isRecord(usage)) {
      throw new Error(`${sourceName}.externalStoreUsages[${index}] must be an object.`);
    }
    const usageKind = usage.usageKind ?? "read";
    if (typeof usageKind !== "string" || !externalStoreUsageKinds.has(usageKind)) {
      throw new Error(
        `${sourceName}.externalStoreUsages[${index}].usageKind must be "read", "read-write", or "write".`,
      );
    }
    return {
      ...usage,
      usageKind,
    } as ExternalStoreUsageNode;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type CacheKeyMatch = {
  readonly kind: "exact" | "prefix" | "maybe";
  readonly cacheKey: readonly string[];
  readonly remoteKey: readonly string[];
  readonly note: string;
};

export const demoGraph: YomiGraph = {
  components: [
    {
      id: "route-demo",
      name: "CustomerSearchRoute",
      role: "route",
      runtime: "unknown",
      source: {
        file: "src/routes/customer-search.tsx",
        line: 12,
        symbol: "CustomerSearchRoute",
      },
      ownsState: [],
      usesHooks: [],
      renders: ["customer-search-panel"],
    },
    {
      id: "customer-search-panel",
      name: "CustomerSearchPanel",
      role: "component",
      runtime: "unknown",
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 31,
        symbol: "CustomerSearchPanel",
      },
      ownsState: ["query-state", "selected-customer-state", "loading-state"],
      usesHooks: ["customer-search-effect", "customer-search-state"],
      renders: ["search-input", "search-status", "customer-card"],
    },
    {
      id: "search-input",
      name: "SearchInput",
      role: "design-system",
      runtime: "unknown",
      source: {
        file: "src/components/ui/SearchInput.tsx",
        line: 8,
        symbol: "SearchInput",
      },
      ownsState: [],
      usesHooks: [],
      renders: [],
    },
    {
      id: "customer-card",
      name: "CustomerCard",
      role: "component",
      runtime: "unknown",
      source: {
        file: "src/features/customers/CustomerCard.tsx",
        line: 18,
        symbol: "CustomerCard",
      },
      ownsState: [],
      usesHooks: [],
      renders: [],
    },
  ],
  renderEdges: [
    {
      id: "route-demo-renders-customer-search-panel",
      ownerComponentId: "route-demo",
      childComponentId: "customer-search-panel",
      kind: "render",
      source: {
        file: "src/routes/customer-search.tsx",
        line: 14,
        symbol: "CustomerSearchPanel",
      },
      note: "CustomerSearchRoute renders CustomerSearchPanel.",
    },
    {
      id: "customer-search-panel-renders-search-input",
      ownerComponentId: "customer-search-panel",
      childComponentId: "search-input",
      kind: "render",
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 42,
        symbol: "SearchInput",
      },
      note: "CustomerSearchPanel renders SearchInput.",
    },
    {
      id: "customer-search-panel-renders-customer-card",
      ownerComponentId: "customer-search-panel",
      childComponentId: "customer-card",
      kind: "render",
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 56,
        symbol: "CustomerCard",
      },
      note: "CustomerSearchPanel renders CustomerCard.",
    },
  ],
  states: [
    {
      id: "query-state",
      name: "query",
      ownerComponentId: "customer-search-panel",
      kind: "local",
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 34,
        symbol: "query",
      },
    },
    {
      id: "selected-customer-state",
      name: "selectedCustomer",
      ownerComponentId: "customer-search-panel",
      kind: "remote",
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 35,
        symbol: "selectedCustomer",
      },
    },
    {
      id: "loading-state",
      name: "isLoading",
      ownerComponentId: "customer-search-panel",
      kind: "local",
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 36,
        symbol: "isLoading",
      },
    },
  ],
  hooks: [
    {
      id: "customer-search-state",
      name: "useState",
      ownerComponentId: "customer-search-panel",
      kind: "state",
      dependencies: [],
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 34,
        symbol: "useState",
      },
      risk: "low",
      note: "Local state owns the visible search query and remote customer result.",
    },
    {
      id: "customer-search-effect",
      name: "useEffect",
      ownerComponentId: "customer-search-panel",
      kind: "effect",
      dependencies: ["query"],
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 42,
        symbol: "useEffect",
      },
      risk: "high",
      note: "Fetch response can commit after a newer query unless the effect aborts or ignores stale responses.",
    },
  ],
  actions: [
    {
      id: "edit-query-action",
      name: "edit query",
      ownerComponentId: "search-input",
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 73,
        symbol: "onChange",
      },
      touchesState: ["query-state", "loading-state"],
      triggersHooks: ["customer-search-effect"],
      network: ["/api/customers/search?q=:query"],
    },
  ],
  ui: [
    {
      id: "search-input-node",
      label: "Customer search",
      role: "input",
      componentId: "search-input",
      actionId: "edit-query-action",
      stateIds: ["query-state"],
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 72,
        symbol: "<SearchInput />",
      },
    },
    {
      id: "search-status-node",
      label: "Search status",
      role: "status",
      componentId: "customer-search-panel",
      stateIds: ["loading-state"],
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 88,
        symbol: "statusMessage",
      },
    },
    {
      id: "customer-card-node",
      label: "Customer card",
      role: "panel",
      componentId: "customer-card",
      stateIds: ["selected-customer-state"],
      source: {
        file: "src/features/customers/CustomerCard.tsx",
        line: 18,
        symbol: "CustomerCard",
      },
    },
  ],
  remoteData: [
    {
      id: "customer-search-query-remote",
      ownerComponentId: "customer-search-panel",
      kind: "react-query",
      key: ["customers", "query"],
      endpoint: "/api/customers/search?q=:query",
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 41,
        symbol: "useQuery",
      },
      risk: "low",
      note: "Search results are keyed by the current query; broad invalidation can refetch this data.",
    },
    {
      id: "customer-summary-query-remote",
      ownerComponentId: "customer-search-panel",
      kind: "swr",
      key: ["customer-summary", "query"],
      endpoint: "/api/customers/summary?q=:query",
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 48,
        symbol: "useSWR",
      },
      risk: "medium",
      note: "Summary data shares the query dependency and can drift from search results if cache updates are incomplete.",
    },
  ],
  cacheOperations: [
    {
      id: "customer-search-invalidate-cache",
      ownerActionId: "edit-query-action",
      ownerComponentId: "customer-search-panel",
      kind: "invalidate",
      targetKey: ["customers"],
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 76,
        symbol: "invalidateQueries",
      },
    },
    {
      id: "customer-summary-mutate-cache",
      ownerActionId: "edit-query-action",
      ownerComponentId: "customer-search-panel",
      kind: "mutate",
      targetKey: ["customer-summary", "query"],
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 77,
        symbol: "mutate",
      },
    },
  ],
  formFields: [],
  designSystemUsages: [
    {
      id: "customer-search-panel-uses-search-input-1",
      ownerComponentId: "customer-search-panel",
      componentId: "search-input",
      componentName: "SearchInput",
      props: ["aria-label", "onChange", "value"],
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 72,
        symbol: "SearchInput",
      },
      note: "CustomerSearchPanel renders design-system component SearchInput.",
    },
  ],
  props: [
    {
      id: "customer-search-panel-passes-search-input-on-change-1-prop",
      ownerComponentId: "customer-search-panel",
      targetComponentId: "search-input",
      propName: "onChange",
      kind: "event-handler",
      value: "handleQueryChange",
      references: ["handleQueryChange"],
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 75,
        symbol: "onChange",
      },
      note: "CustomerSearchPanel passes event handler prop onChange to SearchInput.",
    },
    {
      id: "customer-search-panel-passes-search-input-value-1-prop",
      ownerComponentId: "customer-search-panel",
      targetComponentId: "search-input",
      propName: "value",
      kind: "value",
      value: "query",
      references: ["query"],
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 74,
        symbol: "value",
      },
      note: "CustomerSearchPanel passes value prop value to SearchInput.",
    },
  ],
  contextUsages: [
    {
      id: "customer-search-panel-uses-customer-search-context-1",
      ownerComponentId: "customer-search-panel",
      contextName: "CustomerSearchContext",
      hookName: "useCustomerSearch",
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 32,
        symbol: "useCustomerSearch",
      },
      providerSource: {
        file: "src/features/customers/CustomerSearchProvider.tsx",
        line: 18,
        symbol: "CustomerSearchContext.Provider",
      },
      note: "CustomerSearchPanel reads CustomerSearchContext through useCustomerSearch.",
    },
  ],
  externalStoreUsages: [],
  reduxActionUsages: [],
  reduxSelectorUsages: [],
};

export function getComponentOwner(graph: YomiGraph, uiNodeId: string): QueryResult {
  const uiNode = graph.ui.find((node) => node.id === uiNodeId);
  if (uiNode === undefined) {
    return emptyResult("getComponentOwner", `UI node ${uiNodeId} was not found.`);
  }

  const component = graph.components.find((node) => node.id === uiNode.componentId);
  if (component === undefined) {
    return emptyResult(
      "getComponentOwner",
      `Component ${uiNode.componentId} was not found.`,
    );
  }

  return {
    query: `getComponentOwner("${uiNodeId}")`,
    summary: `${uiNode.label} is rendered by ${component.name}.`,
    nodes: [
      {
        label: component.name,
        detail: `${component.role}${formatRuntimeDetail(component)}${formatRouteSegmentDetail(component)}; owns ${component.ownsState.length} state node(s).`,
        source: component.source,
      },
      ...getDesignSystemUsageNodesForComponent(graph, component.id),
    ],
  };
}

export function getActionPath(graph: YomiGraph, actionId: string): QueryResult {
  const action = graph.actions.find((node) => node.id === actionId);
  if (action === undefined) {
    return emptyResult("getActionPath", `Action ${actionId} was not found.`);
  }

  const owner = graph.components.find((node) => node.id === action.ownerComponentId);
  const stateNodes = action.touchesState
    .map((stateId) => graph.states.find((node) => node.id === stateId))
    .filter((node): node is StateNode => node !== undefined);
  const hookNodes = action.triggersHooks
    .map((hookId) => graph.hooks.find((node) => node.id === hookId))
    .filter((node): node is HookNode => node !== undefined);
  const updatedStateSummary =
    stateNodes.length > 0
      ? `updates ${stateNodes.map((node) => node.name).join(", ")}`
      : "does not directly update known state";
  const triggeredHookSummary =
    hookNodes.length > 0
      ? ` and triggers ${hookNodes.map((node) => node.name).join(", ")}`
      : "";

  return {
    query: `getActionPath("${actionId}")`,
    summary: `${action.name} ${updatedStateSummary}${triggeredHookSummary}.`,
    nodes: [
      ...(owner
        ? [
            {
              label: `owner: ${owner.name}`,
              detail: "Design-system event surface for the visible input.",
              source: owner.source,
            },
          ]
        : []),
      ...stateNodes.map((node) => ({
        label: `state: ${node.name}`,
        detail: `${node.kind} state touched by this action.`,
        source: node.source,
      })),
      ...hookNodes.map((node) => ({
        label: `hook: ${node.name}`,
        detail: node.note,
        source: node.source,
      })),
    ],
  };
}

export function getDataPath(graph: YomiGraph, actionId: string): QueryResult {
  const action = graph.actions.find((node) => node.id === actionId);
  if (action === undefined) {
    return emptyResult("getDataPath", `Action ${actionId} was not found.`);
  }

  const cacheOperations = graph.cacheOperations.filter(
    (operation) => operation.ownerActionId === actionId,
  );
  const remoteMatches = uniqueBy(
    cacheOperations.flatMap((operation) =>
      graph.remoteData.flatMap((remoteData) => {
        const match = getCacheKeyMatch(operation.targetKey, remoteData.key);
        return match === undefined ? [] : [{ operation, remoteData, match }];
      }),
    ),
    ({ operation, remoteData }) => `${operation.id}:${remoteData.id}`,
  );

  if (cacheOperations.length === 0 && remoteMatches.length === 0) {
    return emptyResult(
      "getDataPath",
      `${action.name} has no known cache or remote data path.`,
    );
  }

  return {
    query: `getDataPath("${actionId}")`,
    summary: `${action.name} touches ${cacheOperations.length} cache operation(s) and may affect ${remoteMatches.length} remote data read(s).`,
    nodes: [
      ...cacheOperations.flatMap((operation) => [
        ...(operation.trigger === undefined
          ? []
          : [
              {
                label: formatCacheTriggerLabel(operation.trigger),
                detail: `cacheOperation:${operation.id}; ownerAction:${actionId}; ownerComponent:${operation.ownerComponentId}`,
                source: operation.trigger.source,
              },
            ]),
        ...(operation.policy === undefined
          ? []
          : [
              {
                label: formatCachePolicyLabel(operation.policy),
                detail: `cacheOperation:${operation.id}; ${operation.policy.options.map((option) => `${option.name}:${option.value}`).join("; ")}`,
                source: operation.policy.source,
              },
            ]),
        {
          label: `cache: ${operation.kind} ${formatKey(operation.targetKey)}`,
          detail: `ownerAction:${actionId}; ownerComponent:${operation.ownerComponentId}${operation.trigger === undefined ? "" : `; trigger:${operation.trigger.kind}:${operation.trigger.reference}`}${operation.policy === undefined ? "" : `; policy:${operation.policy.kind}`}`,
          source: operation.source,
        },
      ]),
      ...remoteMatches.map(({ remoteData, match }) => ({
        label: `remote: ${remoteData.kind} ${formatKey(remoteData.key)}`,
        detail: `match:${match.kind}; ${match.note}; ${remoteData.risk} risk${remoteData.endpoint ? `; endpoint:${remoteData.endpoint}` : ""}. ${remoteData.note}`,
        source: remoteData.source,
      })),
    ],
  };
}

function formatCachePolicyLabel(policy: CacheOperationPolicy): string {
  switch (policy.kind) {
    case "optimistic-update":
      return "cache policy: optimistic update";
  }
}

function formatCacheTriggerLabel(trigger: CacheOperationTrigger): string {
  switch (trigger.kind) {
    case "mutation-error":
      return `mutation error: ${trigger.reference}`;
    case "mutation-settled":
      return `mutation settled: ${trigger.reference}`;
    case "mutation-success":
      return `mutation success: ${trigger.reference}`;
  }
}

export function getRepairBrief(graph: YomiGraph, actionId: string): QueryResult {
  const action = graph.actions.find((node) => node.id === actionId);
  if (action === undefined) {
    return emptyResult("getRepairBrief", `Action ${actionId} was not found.`);
  }

  const owner = graph.components.find((node) => node.id === action.ownerComponentId);
  const nextContextNodes =
    owner === undefined ? [] : getNextRepairContextNodes(graph, owner.id);
  const stateNodes = action.touchesState
    .map((stateId) => graph.states.find((node) => node.id === stateId))
    .filter((node): node is StateNode => node !== undefined);
  const hookNodes = action.triggersHooks
    .map((hookId) => graph.hooks.find((node) => node.id === hookId))
    .filter((node): node is HookNode => node !== undefined);
  const dataPath = getDataPath(graph, actionId);
  const formFields = getFormFieldsForAction(graph, action);
  const designSystemUsageNodes =
    owner === undefined ? [] : getDesignSystemUsageNodesForComponent(graph, owner.id);
  const propNodes = owner === undefined ? [] : getPropNodesForComponent(graph, owner.id);
  const contextUsageNodes =
    owner === undefined ? [] : getContextUsageNodesForComponentTree(graph, owner.id);
  const externalStoreUsages = getExternalStoreUsagesForAction(graph, action, owner?.id);
  const externalStoreUsageNodes = externalStoreUsages.map(externalStoreUsageToQueryNode);
  const reduxActionUsages = getReduxActionUsagesForAction(graph, action, owner?.id);
  const reduxActionUsageNodes = reduxActionUsages.map(reduxActionUsageToQueryNode);
  const reduxSelectorUsageNodes =
    owner === undefined ? [] : getReduxSelectorUsageNodesForComponentTree(graph, owner.id);
  const editTarget = findPrimaryEditTarget(
    action,
    hookNodes,
    dataPath.nodes,
    owner,
    formFields,
    externalStoreUsages,
    reduxActionUsages,
    propNodes,
  );

  return {
    query: `getRepairBrief("${actionId}")`,
    summary: `${action.name} repair brief: ${stateNodes.length} state node(s), ${hookNodes.length} hook(s), ${dataPath.nodes.length} data/cache node(s), ${formFields.length} form field(s), ${nextContextNodes.length} Next/RSC context node(s), ${externalStoreUsages.length} external store usage(s), ${reduxActionUsages.length} Redux action usage(s), ${reduxSelectorUsageNodes.length} Redux selector usage(s).`,
    nodes: [
      ...(owner
        ? [
            {
              label: `ui owner: ${owner.name}`,
              detail: `${formatComponentRole(owner.role)}${formatRuntimeDetail(owner)}${formatRouteSegmentDetail(owner)} that owns the action surface.`,
              source: owner.source,
            },
          ]
        : []),
      ...nextContextNodes,
      ...stateNodes.map((node) => ({
        label: `state touched: ${node.name}`,
        detail: `${node.kind} state touched by ${action.name}.`,
        source: node.source,
      })),
      ...hookNodes.map((node) => ({
        label: `effect/hook: ${node.name}`,
        detail: node.note,
        source: node.source,
      })),
      ...hookNodes.flatMap((node) =>
        node.cleanup === undefined
          ? []
          : [
              {
                label:
                  node.cleanup.kind === "missing-cleanup-risk"
                    ? "effect cleanup risk: missing cleanup"
                    : "effect cleanup: cleanup present",
                detail: `${node.cleanup.note} Resources: ${node.cleanup.resources.join(", ")}.`,
                source: node.cleanup.source,
              },
            ],
      ),
      ...formFields.flatMap((field) => [
        ...(field.register === undefined
          ? []
          : [
              {
                label: `form field: ${field.name}`,
                detail: `registered field${field.stateId === undefined ? "" : `; state:${field.stateId}`}`,
                source: field.register,
              },
            ]),
        ...(field.validation === undefined
          ? []
          : [
              {
                label: `form validation: ${field.name}`,
                detail: field.validation.options
                  .map((option) => `${option.name}:${option.value}`)
                  .join("; "),
                source: field.validation.source,
              },
            ]),
        ...field.errors.map((error) => ({
          label: `form error ${error.kind}: ${field.name}`,
          detail: `reference:${error.reference}${field.stateId === undefined ? "" : `; state:${field.stateId}`}`,
          source: error.source,
        })),
      ]),
      ...dataPath.nodes.map((node) => ({
        label: `data path: ${node.label}`,
        detail: node.detail,
        source: node.source,
      })),
      ...externalStoreUsageNodes,
      ...reduxActionUsageNodes,
      ...reduxSelectorUsageNodes,
      ...designSystemUsageNodes,
      ...propNodes,
      ...contextUsageNodes,
      ...(editTarget
        ? [
            {
              label: "likely edit target",
              detail:
                "Start here before editing display-only child components; this source owns the behavior path.",
              source: editTarget,
            },
          ]
        : []),
    ],
  };
}

function getNextRepairContextNodes(
  graph: YomiGraph,
  componentId: string,
): QueryResult["nodes"] {
  const ancestorEdges = getAncestorRenderEdges(graph, componentId);
  const routeNodes = uniqueBy(
    ancestorEdges
      .map((edge) => graph.components.find((component) => component.id === edge.ownerComponentId))
      .filter((component): component is ComponentNode => component?.routeSegment !== undefined),
    (component) => component.id,
  ).map((component) => ({
    label: `next route: ${component.routeSegment?.path ?? "<unknown>"}`,
    detail: `${component.routeSegment?.kind ?? "unknown"} route; component:${component.id}${formatRuntimeDetail(component)}. This route renders the action owner through the component tree.`,
    source: component.source,
  }));

  const boundaryNodes = ancestorEdges
    .filter((edge) => edge.kind === "server-to-client-boundary")
    .flatMap((edge) => [
      {
        label: "rsc boundary: server to client",
        detail: edge.note,
        source: edge.source,
      },
      ...(edge.suspenseBoundary === undefined
        ? []
        : [
            {
              label: `rsc suspense: ${edge.suspenseBoundary.fallback}`,
              detail: `${edge.childComponentId}; ${edge.suspenseBoundary.note}`,
              source: edge.suspenseBoundary.source,
            },
          ]),
      ...(edge.serializationRisks ?? []).map((risk) => ({
        label: `rsc boundary prop risk: ${risk.propName}`,
        detail: `${risk.kind}; ${risk.note}`,
        source: risk.source,
      })),
    ]);

  return [...routeNodes, ...boundaryNodes];
}

function getAncestorRenderEdges(
  graph: YomiGraph,
  componentId: string,
): readonly ComponentRenderEdgeNode[] {
  const edges: ComponentRenderEdgeNode[] = [];
  const visitedComponents = new Set<string>([componentId]);
  const visitedEdges = new Set<string>();
  const queue = [componentId];

  while (queue.length > 0) {
    const childComponentId = queue.shift();
    if (childComponentId === undefined) {
      continue;
    }

    for (const edge of graph.renderEdges) {
      if (edge.childComponentId !== childComponentId || visitedEdges.has(edge.id)) {
        continue;
      }

      visitedEdges.add(edge.id);
      edges.push(edge);
      if (!visitedComponents.has(edge.ownerComponentId)) {
        visitedComponents.add(edge.ownerComponentId);
        queue.push(edge.ownerComponentId);
      }
    }
  }

  return edges;
}

function getDesignSystemUsageNodesForComponent(
  graph: YomiGraph,
  componentId: string,
): QueryResult["nodes"] {
  return (graph.designSystemUsages ?? [])
    .filter(
      (usage) =>
        usage.ownerComponentId === componentId || usage.componentId === componentId,
    )
    .map((usage) => ({
      label: `design-system: ${usage.componentName}`,
      detail: `${usage.note}${usage.props.length === 0 ? "" : ` Props: ${usage.props.join(", ")}.`}`,
      source: usage.source,
    }));
}

function getPropNodesForComponent(
  graph: YomiGraph,
  componentId: string,
): QueryResult["nodes"] {
  return (graph.props ?? [])
    .filter(
      (prop) =>
        prop.ownerComponentId === componentId || prop.targetComponentId === componentId,
    )
    .map((prop) => ({
      label: `prop: ${prop.propName}`,
      detail: `${prop.note} Value: ${prop.value}.${prop.viaSpread === undefined ? "" : ` Via spread: ${prop.viaSpread}.`}${prop.references.length === 0 ? "" : ` References: ${prop.references.join(", ")}.`}`,
      source: prop.source,
    }));
}

function getContextUsageNodesForComponentTree(
  graph: YomiGraph,
  componentId: string,
): QueryResult["nodes"] {
  const componentIds = new Set([componentId, ...getDescendantComponentIds(graph, componentId)]);
  return (graph.contextUsages ?? [])
    .filter((usage) => componentIds.has(usage.ownerComponentId))
    .map((usage) => ({
      label: `context: ${usage.contextName}`,
      detail: `${usage.note}${usage.providerSource === undefined ? "" : ` Provider: ${usage.providerSource.file}:${usage.providerSource.line}.`}`,
      source: usage.source,
    }));
}

function getExternalStoreUsagesForAction(
  graph: YomiGraph,
  action: ActionNode,
  ownerComponentId: string | undefined,
): readonly ExternalStoreUsageNode[] {
  const referencedStoreUsageIds = action.externalStoreUsages ?? [];
  if (referencedStoreUsageIds.length > 0) {
    return uniqueBy(
      referencedStoreUsageIds
        .map((usageId) => graph.externalStoreUsages.find((usage) => usage.id === usageId))
        .filter((usage): usage is ExternalStoreUsageNode => usage !== undefined),
      (usage) => usage.id,
    );
  }

  return ownerComponentId === undefined
    ? []
    : getExternalStoreUsagesForComponentTree(graph, ownerComponentId);
}

function getExternalStoreUsagesForComponentTree(
  graph: YomiGraph,
  componentId: string,
): readonly ExternalStoreUsageNode[] {
  const componentIds = new Set([componentId, ...getDescendantComponentIds(graph, componentId)]);
  return (graph.externalStoreUsages ?? []).filter((usage) =>
    componentIds.has(usage.ownerComponentId),
  );
}

function getExternalStoreUsageNodesForComponentTree(
  graph: YomiGraph,
  componentId: string,
): QueryResult["nodes"] {
  return getExternalStoreUsagesForComponentTree(graph, componentId).map(
    externalStoreUsageToQueryNode,
  );
}

function externalStoreUsageToQueryNode(usage: ExternalStoreUsageNode): QueryResult["nodes"][number] {
  return {
    label: `external store: ${usage.storeName}`,
    detail: `${usage.note} Usage:${usage.usageKind}.${usage.selectedFields.length === 0 ? "" : ` Fields: ${usage.selectedFields.join(", ")}.`}${usage.storeSource === undefined ? "" : ` Store: ${usage.storeSource.file}:${usage.storeSource.line}.`}${usage.selectedSources.length === 0 ? "" : ` Selected sources: ${usage.selectedSources.map((selection) => `${selection.fieldName}@${selection.source.file}:${selection.source.line}`).join(", ")}.`}`,
    source: usage.source,
  };
}

function getReduxActionUsagesForAction(
  graph: YomiGraph,
  action: ActionNode,
  ownerComponentId: string | undefined,
): readonly ReduxActionUsageNode[] {
  const referencedUsageIds = action.reduxActionUsages ?? [];
  if (referencedUsageIds.length > 0) {
    return uniqueBy(
      referencedUsageIds
        .map((usageId) => graph.reduxActionUsages.find((usage) => usage.id === usageId))
        .filter((usage): usage is ReduxActionUsageNode => usage !== undefined),
      (usage) => usage.id,
    );
  }

  return ownerComponentId === undefined
    ? []
    : getReduxActionUsagesForComponentTree(graph, ownerComponentId);
}

function getReduxActionUsagesForComponentTree(
  graph: YomiGraph,
  componentId: string,
): readonly ReduxActionUsageNode[] {
  const componentIds = new Set([componentId, ...getDescendantComponentIds(graph, componentId)]);
  return (graph.reduxActionUsages ?? []).filter((usage) =>
    componentIds.has(usage.ownerComponentId),
  );
}

function getReduxActionUsageNodesForComponentTree(
  graph: YomiGraph,
  componentId: string,
): QueryResult["nodes"] {
  return getReduxActionUsagesForComponentTree(graph, componentId).map(
    reduxActionUsageToQueryNode,
  );
}

function reduxActionUsageToQueryNode(usage: ReduxActionUsageNode): QueryResult["nodes"][number] {
  return {
    label: `redux action: ${usage.actionName}`,
    detail: `${usage.note}${usage.actionSource === undefined ? "" : ` Action: ${usage.actionSource.file}:${usage.actionSource.line}.`}${usage.reducerSource === undefined ? "" : ` Reducer: ${usage.reducerSource.file}:${usage.reducerSource.line}.`}`,
    source: usage.dispatchSource,
  };
}

function getReduxSelectorUsagesForComponentTree(
  graph: YomiGraph,
  componentId: string,
): readonly ReduxSelectorUsageNode[] {
  const componentIds = new Set([componentId, ...getDescendantComponentIds(graph, componentId)]);
  return (graph.reduxSelectorUsages ?? []).filter((usage) =>
    componentIds.has(usage.ownerComponentId),
  );
}

function getReduxSelectorUsageNodesForComponentTree(
  graph: YomiGraph,
  componentId: string,
): QueryResult["nodes"] {
  return getReduxSelectorUsagesForComponentTree(graph, componentId).map(
    reduxSelectorUsageToQueryNode,
  );
}

function reduxSelectorUsageToQueryNode(
  usage: ReduxSelectorUsageNode,
): QueryResult["nodes"][number] {
  return {
    label: `redux selector: ${usage.selectedPath.join(".")}`,
    detail: `${usage.note}${usage.selectedSource === undefined ? "" : ` Selected source: ${usage.selectedSource.file}:${usage.selectedSource.line}.`}`,
    source: usage.source,
  };
}

function getDescendantComponentIds(
  graph: YomiGraph,
  componentId: string,
): readonly string[] {
  const descendants: string[] = [];
  const visited = new Set<string>([componentId]);
  const queue = [componentId];

  while (queue.length > 0) {
    const ownerComponentId = queue.shift();
    if (ownerComponentId === undefined) {
      continue;
    }

    for (const edge of graph.renderEdges) {
      if (edge.ownerComponentId !== ownerComponentId || visited.has(edge.childComponentId)) {
        continue;
      }

      visited.add(edge.childComponentId);
      descendants.push(edge.childComponentId);
      queue.push(edge.childComponentId);
    }
  }

  return descendants;
}

export function getRepairBriefFromUi(graph: YomiGraph, uiTarget: string): QueryResult {
  const uiNode = findUiNodeForBrief(graph, uiTarget);
  if (uiNode === undefined) {
    return emptyResult(
      "getRepairBriefFromUi",
      `No UI node matched "${uiTarget}".`,
    );
  }

  if (uiNode.actionId === undefined) {
    const owner = graph.components.find((component) => component.id === uiNode.componentId);
    return {
      query: `getRepairBriefFromUi("${uiTarget}")`,
      summary: `${uiNode.label} has no known action path; start from its component owner.`,
      nodes: [
        {
          label: `ui: ${uiNode.label}`,
          detail: `component:${uiNode.componentId}; no actionId on this UI node.`,
          source: uiNode.source,
        },
        ...(owner
          ? [
              {
                label: `component owner: ${owner.name}`,
                detail: `${formatComponentRole(owner.role)}${formatRuntimeDetail(owner)} that renders this UI node.`,
                source: owner.source,
              },
            ]
          : []),
      ],
    };
  }

  const repairBrief = getRepairBrief(graph, uiNode.actionId);
  return {
    query: `getRepairBriefFromUi("${uiTarget}")`,
    summary: `${uiNode.label} maps to ${uiNode.actionId}. ${repairBrief.summary}`,
    nodes: [
      {
        label: `ui: ${uiNode.label}`,
        detail: `ui:${uiNode.id}; component:${uiNode.componentId}; action:${uiNode.actionId}`,
        source: uiNode.source,
      },
      ...repairBrief.nodes,
    ],
  };
}

export function findUiNode(graph: YomiGraph, searchText: string): QueryResult {
  const normalizedSearch = searchText.toLowerCase();
  const nodes = graph.ui.filter((node) => {
    const haystack = `${node.id} ${node.label} ${node.role} ${node.source.symbol}`.toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  if (nodes.length === 0) {
    return emptyResult("findUiNode", `No UI node matched "${searchText}".`);
  }

  return {
    query: `findUiNode("${searchText}")`,
    summary: `${nodes.length} UI node(s) matched "${searchText}".`,
    nodes: nodes.map((node) => ({
      label: `${node.label} (${node.role})`,
      detail: `ui:${node.id}; component:${node.componentId}${
        node.actionId ? `; action:${node.actionId}` : ""
      }`,
      source: node.source,
    })),
  };
}

export function getEffectsTriggeredBy(
  graph: YomiGraph,
  stateOrPropName: string,
): QueryResult {
  const hooks = graph.hooks.filter((hook) =>
    hook.dependencies.includes(stateOrPropName),
  );

  if (hooks.length === 0) {
    return emptyResult(
      "getEffectsTriggeredBy",
      `No effect depends on ${stateOrPropName}.`,
    );
  }

  return {
    query: `getEffectsTriggeredBy("${stateOrPropName}")`,
    summary: `${hooks.length} effect(s) rerun when ${stateOrPropName} changes.`,
    nodes: hooks.map((hook) => ({
      label: `${hook.name}: ${hook.risk} risk`,
      detail: hook.note,
      source: hook.source,
    })),
  };
}

export function getStateOwners(graph: YomiGraph, componentId: string): QueryResult {
  const component = graph.components.find((node) => node.id === componentId);
  if (component === undefined) {
    return emptyResult("getStateOwners", `Component ${componentId} was not found.`);
  }

  const ownedStates = component.ownsState
    .map((stateId) => graph.states.find((node) => node.id === stateId))
    .filter((node): node is StateNode => node !== undefined);

  if (ownedStates.length === 0) {
    return emptyResult(
      "getStateOwners",
      `${component.name} owns no known state node.`,
    );
  }

  return {
    query: `getStateOwners("${componentId}")`,
    summary: `${component.name} owns ${ownedStates.length} state node(s).`,
    nodes: ownedStates.map((node) => ({
      label: `state owner: ${node.name}`,
      detail: `${node.kind} state owned by ${component.name}.`,
      source: node.source,
    })),
  };
}

export function getHookDependencies(graph: YomiGraph, componentId: string): QueryResult {
  const component = graph.components.find((node) => node.id === componentId);
  if (component === undefined) {
    return emptyResult("getHookDependencies", `Component ${componentId} was not found.`);
  }

  const hooks = component.usesHooks
    .map((hookId) => graph.hooks.find((node) => node.id === hookId))
    .filter((node): node is HookNode => node !== undefined);

  if (hooks.length === 0) {
    return emptyResult(
      "getHookDependencies",
      `${component.name} uses no known hooks.`,
    );
  }

  return {
    query: `getHookDependencies("${componentId}")`,
    summary: `${component.name} uses ${hooks.length} hook(s).`,
    nodes: hooks.map((hook) => ({
      label: `hook dependencies: ${hook.name}`,
      detail:
        hook.dependencies.length > 0
          ? `depends on ${hook.dependencies.join(", ")}; ${hook.risk} risk. ${hook.note}`
          : `no tracked dependencies; ${hook.risk} risk. ${hook.note}`,
      source: hook.source,
    })),
  };
}

export function getImpact(graph: YomiGraph, componentId: string): QueryResult {
  const component = graph.components.find((node) => node.id === componentId);
  if (component === undefined) {
    return emptyResult("getImpact", `Component ${componentId} was not found.`);
  }

  const renderedComponents = component.renders
    .map((childId) => graph.components.find((node) => node.id === childId))
    .filter((node): node is ComponentNode => node !== undefined);
  const renderEdges = graph.renderEdges.filter(
    (edge) => edge.ownerComponentId === componentId,
  );
  const ownedStates = component.ownsState
    .map((stateId) => graph.states.find((node) => node.id === stateId))
    .filter((node): node is StateNode => node !== undefined);
  const hooks = component.usesHooks
    .map((hookId) => graph.hooks.find((node) => node.id === hookId))
    .filter((node): node is HookNode => node !== undefined);
  const designSystemUsageNodes = getDesignSystemUsageNodesForComponent(graph, component.id);
  const propNodes = getPropNodesForComponent(graph, component.id);
  const contextUsageNodes = getContextUsageNodesForComponentTree(graph, component.id);
  const externalStoreUsageNodes = getExternalStoreUsageNodesForComponentTree(graph, component.id);
  const reduxActionUsageNodes = getReduxActionUsageNodesForComponentTree(graph, component.id);
  const reduxSelectorUsageNodes = getReduxSelectorUsageNodesForComponentTree(graph, component.id);

  return {
    query: `getImpact("${componentId}")`,
    summary: `${component.name} impacts ${renderedComponents.length} rendered component(s), ${ownedStates.length} state node(s), ${hooks.length} hook(s), ${designSystemUsageNodes.length} design-system usage(s), ${propNodes.length} prop boundary node(s), ${contextUsageNodes.length} context usage(s), ${externalStoreUsageNodes.length} external store usage(s), ${reduxActionUsageNodes.length} Redux action usage(s), and ${reduxSelectorUsageNodes.length} Redux selector usage(s).`,
    nodes: [
      ...renderedComponents.map((node) => ({
        label: `renders: ${node.name}`,
        detail: `${formatComponentRole(node.role)}${formatRuntimeDetail(node)}${formatPackageEntryDetail(node)} rendered below ${component.name}.`,
        source:
          renderEdges.find((edge) => edge.childComponentId === node.id)?.source ?? node.source,
      })),
      ...renderEdges
        .filter((edge) => edge.kind === "server-to-client-boundary")
        .map((edge) => ({
          label: "boundary: server to client",
          detail: edge.note,
          source: edge.source,
      })),
      ...renderEdges.flatMap((edge) =>
        edge.suspenseBoundary === undefined
          ? []
          : [
              {
                label: `suspense: ${edge.suspenseBoundary.fallback}`,
                detail: `${edge.childComponentId}; ${edge.suspenseBoundary.note}`,
                source: edge.suspenseBoundary.source,
              },
            ],
      ),
      ...renderEdges.flatMap((edge) =>
        (edge.serializationRisks ?? []).map((risk) => ({
          label: `boundary prop risk: ${risk.propName}`,
          detail: `${risk.kind}; ${risk.note}`,
          source: risk.source,
        })),
      ),
      ...ownedStates.map((node) => ({
        label: `owns state: ${node.name}`,
        detail: `${node.kind} state owned by ${component.name}.`,
        source: node.source,
      })),
      ...hooks.map((node) => ({
        label: `uses hook: ${node.name}`,
        detail: node.note,
        source: node.source,
      })),
      ...hooks.flatMap((node) =>
        node.cleanup === undefined
          ? []
          : [
              {
                label:
                  node.cleanup.kind === "missing-cleanup-risk"
                    ? "effect cleanup risk: missing cleanup"
                    : "effect cleanup: cleanup present",
                detail: `${node.cleanup.note} Resources: ${node.cleanup.resources.join(", ")}.`,
                source: node.cleanup.source,
              },
            ],
      ),
      ...designSystemUsageNodes,
      ...propNodes,
      ...contextUsageNodes,
      ...externalStoreUsageNodes,
      ...reduxActionUsageNodes,
      ...reduxSelectorUsageNodes,
    ],
  };
}

export function getSourceLocations(graph: YomiGraph, graphNodeId: string): QueryResult {
  const nodes = [
    ...graph.components.map((node) => ({
      id: node.id,
      label: `component: ${node.name}`,
      detail: `${formatComponentRole(node.role)}${formatRuntimeDetail(node)}${formatPackageEntryDetail(node)} source location.`,
      source: node.source,
    })),
    ...graph.renderEdges.map((node) => ({
      id: node.id,
      label:
        node.kind === "server-to-client-boundary"
          ? `boundary: ${node.ownerComponentId} -> ${node.childComponentId}`
          : `render: ${node.ownerComponentId} -> ${node.childComponentId}`,
      detail: node.note,
      source: node.source,
    })),
    ...graph.ui.map((node) => ({
      id: node.id,
      label: `ui: ${node.label}`,
      detail: `${node.role} UI node source location.`,
      source: node.source,
    })),
    ...graph.states.map((node) => ({
      id: node.id,
      label: `state: ${node.name}`,
      detail: `${node.kind} state source location.`,
      source: node.source,
    })),
    ...graph.hooks.map((node) => ({
      id: node.id,
      label: `hook: ${node.name}`,
      detail: `${node.kind} hook source location.`,
      source: node.source,
    })),
    ...graph.hooks.flatMap((node) =>
      node.cleanup === undefined
        ? []
        : [
            {
              id: `${node.id}-cleanup`,
              label:
                node.cleanup.kind === "missing-cleanup-risk"
                  ? "effect cleanup risk: missing cleanup"
                  : "effect cleanup: cleanup present",
              detail: `${node.cleanup.note} Resources: ${node.cleanup.resources.join(", ")}.`,
              source: node.cleanup.source,
            },
          ],
    ),
    ...graph.actions.map((node) => ({
      id: node.id,
      label: `action: ${node.name}`,
      detail: "action source location.",
      source: node.source,
    })),
    ...graph.remoteData.map((node) => ({
      id: node.id,
      label: `remote: ${node.kind} ${formatKey(node.key)}`,
      detail: "remote data source location.",
      source: node.source,
    })),
    ...graph.cacheOperations.map((node) => ({
      id: node.id,
      label: `cache: ${node.kind} ${formatKey(node.targetKey)}`,
      detail: "cache operation source location.",
      source: node.source,
    })),
    ...(graph.designSystemUsages ?? []).map((node) => ({
      id: node.id,
      label: `design-system usage: ${node.componentName}`,
      detail: `${node.note}${node.props.length === 0 ? "" : ` Props: ${node.props.join(", ")}.`}`,
      source: node.source,
    })),
    ...(graph.props ?? []).map((node) => ({
      id: node.id,
      label: `prop: ${node.propName}`,
      detail: `${node.kind} prop boundary. ${node.note} Value: ${node.value}.`,
      source: node.source,
    })),
    ...(graph.contextUsages ?? []).map((node) => ({
      id: node.id,
      label: `context: ${node.contextName}`,
      detail: `${node.note}${node.providerSource === undefined ? "" : ` Provider: ${node.providerSource.file}:${node.providerSource.line}.`}`,
      source: node.source,
    })),
    ...(graph.externalStoreUsages ?? []).map((node) => ({
      id: node.id,
      label: `external store: ${node.storeName}`,
      detail: externalStoreUsageToQueryNode(node).detail,
      source: node.source,
    })),
    ...(graph.reduxActionUsages ?? []).map((node) => ({
      id: node.id,
      label: `redux action: ${node.actionName}`,
      detail: reduxActionUsageToQueryNode(node).detail,
      source: node.dispatchSource,
    })),
    ...(graph.reduxSelectorUsages ?? []).map((node) => ({
      id: node.id,
      label: `redux selector: ${node.selectedPath.join(".")}`,
      detail: reduxSelectorUsageToQueryNode(node).detail,
      source: node.source,
    })),
  ].filter((node) => node.id === graphNodeId);

  if (nodes.length === 0) {
    return emptyResult(
      "getSourceLocations",
      `Graph node ${graphNodeId} was not found.`,
    );
  }

  return {
    query: `getSourceLocations("${graphNodeId}")`,
    summary: `${nodes.length} source location(s) matched ${graphNodeId}.`,
    nodes: nodes.map(({ label, detail, source }) => ({ label, detail, source })),
  };
}

export function getRuntimeTrace(
  trace: readonly TraceEvent[],
  interactionId: string,
): QueryResult {
  const events =
    interactionId === "last" || interactionId === "all"
      ? trace
      : trace.filter(
          (event) =>
            event.id === interactionId ||
            event.correlationId === interactionId ||
            event.graphNodeId === interactionId ||
            event.runtimeInstanceId === interactionId,
        );
  const sourceLinkedEvents = events.filter(
    (event): event is TraceEvent & { readonly source: SourceLocation } =>
      event.source !== undefined,
  );

  if (events.length === 0) {
    return emptyResult(
      "getRuntimeTrace",
      `No runtime trace event matched ${interactionId}.`,
    );
  }

  return {
    query: `getRuntimeTrace("${interactionId}")`,
    summary: `${events.length} runtime event(s), ${sourceLinkedEvents.length} source-linked.`,
    nodes: sourceLinkedEvents.map((event) => ({
      label: `trace: ${event.kind}`,
      detail: `${event.at}; event:${event.id}${
        event.graphNodeId ? `; graph:${event.graphNodeId}` : ""
      }${event.correlationId ? `; correlation:${event.correlationId}` : ""}${
        event.runtimeInstanceId ? `; instance:${event.runtimeInstanceId}` : ""
      }. ${
        event.summary
      }`,
      source: event.source,
    })),
  };
}

function findUiNodeForBrief(graph: YomiGraph, uiTarget: string): UiNode | undefined {
  const byId = graph.ui.find((node) => node.id === uiTarget);
  if (byId !== undefined) {
    return byId;
  }

  const normalizedTarget = uiTarget.toLowerCase();
  const byExactLabel = graph.ui.find((node) => node.label.toLowerCase() === normalizedTarget);
  if (byExactLabel !== undefined) {
    return byExactLabel;
  }

  return graph.ui.find((node) => {
    const haystack = `${node.label} ${node.role} ${node.source.symbol}`.toLowerCase();
    return haystack.includes(normalizedTarget);
  });
}

function getFormFieldsForAction(graph: YomiGraph, action: ActionNode): readonly FormFieldNode[] {
  return graph.formFields.filter(
    (field) =>
      field.ownerComponentId === action.ownerComponentId &&
      field.stateId !== undefined &&
      action.touchesState.includes(field.stateId),
  );
}

function findPrimaryEditTarget(
  action: ActionNode,
  hooks: readonly HookNode[],
  dataPathNodes: QueryResult["nodes"],
  owner: ComponentNode | undefined,
  formFields: readonly FormFieldNode[],
  externalStoreUsages: readonly ExternalStoreUsageNode[],
  reduxActionUsages: readonly ReduxActionUsageNode[],
  propNodes: readonly QueryResult["nodes"][number][],
): SourceLocation | undefined {
  const formFieldSource =
    formFields.find((field) => field.validation !== undefined)?.validation?.source ??
    formFields.find((field) => field.register !== undefined)?.register;
  if (formFieldSource !== undefined) {
    return formFieldSource;
  }

  if (action.name.startsWith("register ")) {
    return action.source;
  }

  const externalStoreSource =
    externalStoreUsages.flatMap((usage) => usage.selectedSources)[0]?.source ??
    externalStoreUsages.find((usage) => usage.storeSource !== undefined)?.storeSource;
  if (externalStoreSource !== undefined) {
    return externalStoreSource;
  }

  const reduxReducerSource = reduxActionUsages.find(
    (usage) => usage.reducerSource !== undefined,
  )?.reducerSource;
  if (reduxReducerSource !== undefined) {
    return reduxReducerSource;
  }

  const remountKeyProp = propNodes.find(
    (node) =>
      node.label === "prop: key" &&
      /\b(remount|remounts|remounted|key changes|state loss)\b/i.test(node.detail),
  );
  if (remountKeyProp !== undefined) {
    return remountKeyProp.source;
  }

  const propRenameBoundary = propNodes.find(
    (node) =>
      node.label.startsWith("prop: ") &&
      /\b(prop rename|renamed prop|prop contract|prop mismatch|reads [A-Za-z0-9_$]+)\b/i.test(
        node.detail,
      ),
  );
  if (propRenameBoundary !== undefined) {
    return propRenameBoundary.source;
  }

  const highRiskHook = hooks.find((hook) => hook.risk === "high");
  if (highRiskHook !== undefined) {
    return highRiskHook.source;
  }

  const cacheOperationNode = dataPathNodes.find((node) => node.label.startsWith("cache:"));
  if (cacheOperationNode !== undefined) {
    return cacheOperationNode.source;
  }

  const remoteDataNode = dataPathNodes.find((node) => node.label.startsWith("remote:"));
  if (remoteDataNode !== undefined) {
    return remoteDataNode.source;
  }

  if (action.network.includes("inline handler network call")) {
    return action.implementationSource ?? action.source;
  }

  return owner?.source;
}

function getCacheKeyMatch(
  cacheKey: readonly string[],
  remoteKey: readonly string[],
): CacheKeyMatch | undefined {
  if (cacheKey.length === 0 || remoteKey.length === 0) {
    return {
      kind: "maybe",
      cacheKey,
      remoteKey,
      note: "cache or remote key is unknown",
    };
  }

  const sharedPrefixLength = countSharedPrefix(cacheKey, remoteKey);
  if (sharedPrefixLength === 0) {
    return undefined;
  }

  if (cacheKey.length === remoteKey.length && sharedPrefixLength === cacheKey.length) {
    return {
      kind: "exact",
      cacheKey,
      remoteKey,
      note: "cache key exactly matches remote data key",
    };
  }

  if (cacheKey.length < remoteKey.length && sharedPrefixLength === cacheKey.length) {
    return {
      kind: "prefix",
      cacheKey,
      remoteKey,
      note: "cache key is a prefix of the remote data key",
    };
  }

  return {
    kind: "maybe",
    cacheKey,
    remoteKey,
    note: "cache and remote keys share a leading segment but differ later",
  };
}

function countSharedPrefix(left: readonly string[], right: readonly string[]): number {
  const limit = Math.min(left.length, right.length);
  let count = 0;
  for (let index = 0; index < limit; index += 1) {
    if (left[index] !== right[index]) {
      break;
    }
    count += 1;
  }
  return count;
}

function formatKey(key: readonly string[]): string {
  return key.length === 0 ? "<unknown>" : `[${key.join(", ")}]`;
}

function uniqueBy<T>(items: readonly T[], getKey: (item: T) => string): readonly T[] {
  const seen = new Set<string>();
  const uniqueItems: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueItems.push(item);
  }
  return uniqueItems;
}

function formatComponentRole(role: ComponentNode["role"]): string {
  switch (role) {
    case "design-system":
      return "design-system component";
    case "external-package":
      return "external package component";
    case "route":
      return "route component";
    case "component":
      return "component";
  }
}

function formatRouteSegmentDetail(component: ComponentNode): string {
  return component.routeSegment === undefined
    ? ""
    : `; next ${component.routeSegment.kind} route ${component.routeSegment.path}`;
}

function formatRuntimeDetail(component: ComponentNode): string {
  return component.runtime === "unknown" ? "" : `; ${component.runtime} runtime`;
}

function formatPackageEntryDetail(component: ComponentNode): string {
  return component.packageEntry === undefined
    ? ""
    : `; package:${component.packageEntry.packageName}; import:${component.packageEntry.moduleSpecifier}; entry:${component.packageEntry.entry}`;
}

function emptyResult(query: string, summary: string): QueryResult {
  return {
    query,
    summary,
    nodes: [],
  };
}
