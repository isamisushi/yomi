import { describe, expect, test } from "bun:test";

import {
  demoGraph,
  findUiNode,
  getActionPath,
  getComponentOwner,
  getDataPath,
  getEffectsTriggeredBy,
  getHookDependencies,
  getImpact,
  getRepairBrief,
  getRepairBriefFromUi,
  getRuntimeTrace,
  getSourceLocations,
  getStateOwners,
  parseYomiGraph,
} from "../src/yomi-ir";

describe("parseYomiGraph", () => {
  test("rejects graph JSON missing required top-level arrays", () => {
    const incompleteGraph: Record<string, unknown> = { ...demoGraph };
    delete incompleteGraph.components;

    expect(() => parseYomiGraph(incompleteGraph, "test graph")).toThrow(
      "test graph.components must be an array.",
    );
  });

  test("normalizes legacy external store usages without usageKind", () => {
    const graph = parseYomiGraph(
      {
        ...demoGraph,
        externalStoreUsages: [
          {
            id: "inventory-panel-uses-store",
            ownerComponentId: "inventory-panel",
            storeName: "useInventoryStore",
            hookName: "useInventoryStore",
            selector: "state.sortMode",
            selectedFields: ["sortMode"],
            selectedSources: [],
            source: {
              file: "src/InventoryPanel.tsx",
              line: 12,
              symbol: "useInventoryStore",
            },
            note: "Legacy graph without usageKind.",
          },
        ],
      },
      "legacy graph",
    );

    expect(graph.externalStoreUsages[0]?.usageKind).toBe("read");
  });

  test("rejects invalid external store usageKind values", () => {
    expect(() =>
      parseYomiGraph(
        {
          ...demoGraph,
          externalStoreUsages: [
            {
              id: "inventory-panel-uses-store",
              usageKind: "subscribe",
            },
          ],
        },
        "invalid graph",
      ),
    ).toThrow(
      'invalid graph.externalStoreUsages[0].usageKind must be "read", "read-write", or "write".',
    );
  });
});

describe("Yomi graph queries", () => {
  test("findUiNode returns source-linked UI matches", () => {
    const result = findUiNode(demoGraph, "Customer search");

    expect(result.summary).toBe('1 UI node(s) matched "Customer search".');
    expect(result.nodes).toEqual([
      {
        label: "Customer search (input)",
        detail: "ui:search-input-node; component:search-input; action:edit-query-action",
        source: {
          file: "src/features/customers/CustomerSearchPanel.tsx",
          line: 72,
          symbol: "<SearchInput />",
        },
      },
    ]);
  });

  test("getComponentOwner connects a visible UI node to the owning component", () => {
    const result = getComponentOwner(demoGraph, "search-input-node");

    expect(result.summary).toBe("Customer search is rendered by SearchInput.");
    expect(result.nodes[0]).toMatchObject({
      label: "SearchInput",
      detail: "design-system; owns 0 state node(s).",
      source: {
        file: "src/components/ui/SearchInput.tsx",
        line: 8,
        symbol: "SearchInput",
      },
    });
  });

  test("getComponentOwner includes Next route segment metadata when available", () => {
    const result = getComponentOwner(
      {
        ...demoGraph,
        components: [
          ...demoGraph.components,
          {
            id: "invoice-page",
            name: "InvoicePage",
            role: "route",
            runtime: "server",
            routeSegment: {
              kind: "page",
              path: "/invoices",
            },
            source: {
              file: "src/app/invoices/page.tsx",
              line: 8,
              symbol: "InvoicePage",
            },
            ownsState: [],
            usesHooks: [],
            renders: [],
          },
        ],
        ui: [
          ...demoGraph.ui,
          {
            id: "invoices-page-panel",
            label: "Invoices page",
            role: "panel",
            componentId: "invoice-page",
            stateIds: [],
            source: {
              file: "src/app/invoices/page.tsx",
              line: 16,
              symbol: "<section>",
            },
          },
        ],
      },
      "invoices-page-panel",
    );

    expect(result.nodes[0]).toMatchObject({
      label: "InvoicePage",
      detail: "route; server runtime; next page route /invoices; owns 0 state node(s).",
    });
  });

  test("getActionPath returns touched state and triggered hooks without dumping the graph", () => {
    const result = getActionPath(demoGraph, "edit-query-action");

    expect(result.summary).toBe("edit query updates query, isLoading and triggers useEffect.");
    expect(result.nodes.map((node) => node.label)).toEqual([
      "owner: SearchInput",
      "state: query",
      "state: isLoading",
      "hook: useEffect",
    ]);
  });

  test("getDataPath connects an action to cache operations and affected remote data", () => {
    const result = getDataPath(demoGraph, "edit-query-action");

    expect(result.summary).toBe(
      "edit query touches 2 cache operation(s) and may affect 2 remote data read(s).",
    );
    expect(result.nodes.map((node) => node.label)).toEqual([
      "cache: invalidate [customers]",
      "cache: mutate [customer-summary, query]",
      "remote: react-query [customers, query]",
      "remote: swr [customer-summary, query]",
    ]);
    expect(result.nodes.map((node) => node.detail)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("match:prefix"),
        expect.stringContaining("match:exact"),
      ]),
    );
  });

  test("getDataPath marks same-domain key conflicts as maybe and ignores unrelated keys", () => {
    const graph = {
      ...demoGraph,
      remoteData: [
        {
          id: "customers-query-remote",
          ownerComponentId: "customer-search-panel",
          kind: "react-query" as const,
          key: ["customers", "query"],
          endpoint: "/api/customers?q=",
          source: {
            file: "src/features/customers/CustomerSearchPanel.tsx",
            line: 42,
            symbol: "useQuery",
          },
          risk: "low" as const,
          note: "React Query data is keyed by queryKey.",
        },
        {
          id: "orders-query-remote",
          ownerComponentId: "customer-search-panel",
          kind: "react-query" as const,
          key: ["orders"],
          endpoint: "/api/orders",
          source: {
            file: "src/features/customers/CustomerSearchPanel.tsx",
            line: 54,
            symbol: "useQuery",
          },
          risk: "low" as const,
          note: "React Query data is keyed by queryKey.",
        },
      ],
      cacheOperations: [
        {
          id: "select-customer-conflict-cache",
          ownerActionId: "edit-query-action",
          ownerComponentId: "customer-search-panel",
          kind: "invalidate" as const,
          targetKey: ["customers", "slug"],
          source: {
            file: "src/features/customers/CustomerSearchPanel.tsx",
            line: 60,
            symbol: "invalidateQueries",
          },
        },
      ],
    };

    const result = getDataPath(graph, "edit-query-action");

    expect(result.nodes.map((node) => node.label)).toEqual([
      "cache: invalidate [customers, slug]",
      "remote: react-query [customers, query]",
    ]);
    expect(result.nodes.map((node) => node.label)).not.toContain(
      "remote: react-query [orders]",
    );
    expect(result.nodes.map((node) => node.detail)).toEqual(
      expect.arrayContaining([expect.stringContaining("match:maybe")]),
    );
  });

  test("getDataPath includes mutation callback trigger context for cache operations", () => {
    const graph = {
      ...demoGraph,
      cacheOperations: [
        {
          id: "archive-product-cache",
          ownerActionId: "edit-query-action",
          ownerComponentId: "customer-search-panel",
          kind: "invalidate" as const,
          targetKey: ["product"],
          trigger: {
            kind: "mutation-success" as const,
            reference: "archiveMutation",
            source: {
              file: "src/features/products/ProductArchivePanel.tsx",
              line: 29,
              symbol: "onSuccess",
            },
          },
          source: {
            file: "src/features/products/ProductArchivePanel.tsx",
            line: 30,
            symbol: "invalidateQueries",
          },
        },
      ],
    };

    const result = getDataPath(graph, "edit-query-action");

    expect(result.nodes.map((node) => node.label)).toEqual([
      "mutation success: archiveMutation",
      "cache: invalidate [product]",
    ]);
    expect(result.nodes[1]?.detail).toContain("trigger:mutation-success:archiveMutation");
  });

  test("getRepairBrief combines owner, state, hooks, data path, and edit target", () => {
    const result = getRepairBrief(demoGraph, "edit-query-action");

    expect(result.summary).toBe(
      "edit query repair brief: 2 state node(s), 1 hook(s), 4 data/cache node(s), 0 form field(s), 0 Next/RSC context node(s), 0 external store usage(s), 0 Redux action usage(s), 0 Redux selector usage(s).",
    );
    expect(result.nodes.map((node) => node.label)).toEqual([
      "ui owner: SearchInput",
      "state touched: query",
      "state touched: isLoading",
      "effect/hook: useEffect",
      "data path: cache: invalidate [customers]",
      "data path: cache: mutate [customer-summary, query]",
      "data path: remote: react-query [customers, query]",
      "data path: remote: swr [customer-summary, query]",
      "design-system: SearchInput",
      "prop: onChange",
      "prop: value",
      "likely edit target",
    ]);
    expect(result.nodes.at(-1)).toMatchObject({
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 42,
        symbol: "useEffect",
      },
    });
  });

  test("getRepairBrief surfaces form field ownership as primary repair context", () => {
    const result = getRepairBrief(
      {
        ...demoGraph,
        formFields: [
          {
            id: "search-input-email-form-field",
            name: "email",
            ownerComponentId: "search-input",
            stateId: "query-state",
            register: {
              file: "src/features/customers/CustomerSearchPanel.tsx",
              line: 71,
              symbol: "register",
            },
            validation: {
              options: [{ name: "required", value: '"Email is required."' }],
              source: {
                file: "src/features/customers/CustomerSearchPanel.tsx",
                line: 72,
                symbol: "required",
              },
            },
            errors: [
              {
                kind: "read",
                reference: "errors",
                source: {
                  file: "src/features/customers/CustomerSearchPanel.tsx",
                  line: 82,
                  symbol: "email",
                },
              },
            ],
          },
        ],
      },
      "edit-query-action",
    );

    expect(result.summary).toBe(
      "edit query repair brief: 2 state node(s), 1 hook(s), 4 data/cache node(s), 1 form field(s), 0 Next/RSC context node(s), 0 external store usage(s), 0 Redux action usage(s), 0 Redux selector usage(s).",
    );
    expect(result.nodes.map((node) => node.label)).toContain("form field: email");
    expect(result.nodes.map((node) => node.label)).toContain("form validation: email");
    expect(result.nodes.map((node) => node.label)).toContain("form error read: email");
    expect(result.nodes.at(-1)).toMatchObject({
      label: "likely edit target",
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 72,
        symbol: "required",
      },
    });
  });

  test("getRepairBriefFromUi resolves a visible UI label to the repair brief", () => {
    const result = getRepairBriefFromUi(demoGraph, "Customer search");

    expect(result.summary).toBe(
      "Customer search maps to edit-query-action. edit query repair brief: 2 state node(s), 1 hook(s), 4 data/cache node(s), 0 form field(s), 0 Next/RSC context node(s), 0 external store usage(s), 0 Redux action usage(s), 0 Redux selector usage(s).",
    );
    expect(result.nodes.map((node) => node.label).slice(0, 3)).toEqual([
      "ui: Customer search",
      "ui owner: SearchInput",
      "state touched: query",
    ]);
    expect(result.nodes.at(-1)).toMatchObject({
      label: "likely edit target",
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 42,
        symbol: "useEffect",
      },
    });
  });

  test("getRepairBriefFromUi returns component owner when the UI has no action", () => {
    const result = getRepairBriefFromUi(demoGraph, "Customer card");

    expect(result.summary).toBe(
      "Customer card has no known action path; start from its component owner.",
    );
    expect(result.nodes.map((node) => node.label)).toEqual([
      "ui: Customer card",
      "component owner: CustomerCard",
    ]);
  });

  test("getEffectsTriggeredBy surfaces high-risk effect dependencies", () => {
    const result = getEffectsTriggeredBy(demoGraph, "query");

    expect(result.summary).toBe("1 effect(s) rerun when query changes.");
    expect(result.nodes[0]).toMatchObject({
      label: "useEffect: high risk",
      source: {
        file: "src/features/customers/CustomerSearchPanel.tsx",
        line: 42,
        symbol: "useEffect",
      },
    });
  });

  test("getStateOwners returns component-owned state as edit context", () => {
    const result = getStateOwners(demoGraph, "customer-search-panel");

    expect(result.summary).toBe("CustomerSearchPanel owns 3 state node(s).");
    expect(result.nodes.map((node) => node.label)).toEqual([
      "state owner: query",
      "state owner: selectedCustomer",
      "state owner: isLoading",
    ]);
  });

  test("getHookDependencies returns hook dependency context for a component", () => {
    const result = getHookDependencies(demoGraph, "customer-search-panel");

    expect(result.summary).toBe("CustomerSearchPanel uses 2 hook(s).");
    expect(result.nodes.map((node) => node.label)).toEqual([
      "hook dependencies: useEffect",
      "hook dependencies: useState",
    ]);
    expect(result.nodes[0]?.detail).toContain("depends on query");
  });

  test("getSourceLocations returns source for any graph node id", () => {
    const result = getSourceLocations(demoGraph, "customer-search-effect");

    expect(result.summary).toBe(
      "1 source location(s) matched customer-search-effect.",
    );
    expect(result.nodes).toEqual([
      {
        label: "hook: useEffect",
        detail: "effect hook source location.",
        source: {
          file: "src/features/customers/CustomerSearchPanel.tsx",
          line: 42,
          symbol: "useEffect",
        },
      },
    ]);
  });

  test("getSourceLocations returns source for design-system usages", () => {
    const result = getSourceLocations(
      demoGraph,
      "customer-search-panel-uses-search-input-1",
    );

    expect(result.nodes).toEqual([
      {
        label: "design-system usage: SearchInput",
        detail:
          "CustomerSearchPanel renders design-system component SearchInput. Props: aria-label, onChange, value.",
        source: {
          file: "src/features/customers/CustomerSearchPanel.tsx",
          line: 72,
          symbol: "SearchInput",
        },
      },
    ]);
  });

  test("getSourceLocations returns source for prop boundary nodes", () => {
    const result = getSourceLocations(
      demoGraph,
      "customer-search-panel-passes-search-input-on-change-1-prop",
    );

    expect(result.nodes).toEqual([
      {
        label: "prop: onChange",
        detail:
          "event-handler prop boundary. CustomerSearchPanel passes event handler prop onChange to SearchInput. Value: handleQueryChange.",
        source: {
          file: "src/features/customers/CustomerSearchPanel.tsx",
          line: 75,
          symbol: "onChange",
        },
      },
    ]);
  });

  test("getSourceLocations returns source for context usage nodes", () => {
    const result = getSourceLocations(
      demoGraph,
      "customer-search-panel-uses-customer-search-context-1",
    );

    expect(result.nodes).toEqual([
      {
        label: "context: CustomerSearchContext",
        detail:
          "CustomerSearchPanel reads CustomerSearchContext through useCustomerSearch. Provider: src/features/customers/CustomerSearchProvider.tsx:18.",
        source: {
          file: "src/features/customers/CustomerSearchPanel.tsx",
          line: 32,
          symbol: "useCustomerSearch",
        },
      },
    ]);
  });

  test("getRuntimeTrace returns source-linked trace events without graph dumping", () => {
    const result = getRuntimeTrace(
      [
        {
          id: "trace-1",
          at: "00:00",
          kind: "action-requested",
          summary: "User edits the search field.",
          graphNodeId: "edit-query-action",
          correlationId: "customer-search",
        },
        {
          id: "trace-2",
          at: "00:10",
          kind: "violation-detected",
          summary: "Older response overwrote selectedCustomer.",
          source: {
            file: "src/features/customers/CustomerSearchPanel.tsx",
            line: 50,
            symbol: "setSelectedCustomer",
          },
          graphNodeId: "selected-customer-state",
          correlationId: "customer-search",
        },
      ],
      "customer-search",
    );

    expect(result.summary).toBe("2 runtime event(s), 1 source-linked.");
    expect(result.nodes).toEqual([
      {
        label: "trace: violation-detected",
        detail:
          "00:10; event:trace-2; graph:selected-customer-state; correlation:customer-search. Older response overwrote selectedCustomer.",
        source: {
          file: "src/features/customers/CustomerSearchPanel.tsx",
          line: 50,
          symbol: "setSelectedCustomer",
        },
      },
    ]);
  });

  test("getRuntimeTrace can filter by runtime instance id", () => {
    const result = getRuntimeTrace(
      [
        {
          id: "trace-1",
          at: "00:00",
          kind: "component-mounted",
          summary: "CustomerSearchPanel mounted.",
          source: {
            file: "src/features/customers/CustomerSearchPanel.tsx",
            line: 31,
            symbol: "CustomerSearchPanel",
          },
          graphNodeId: "customer-search-panel",
          runtimeInstanceId: "customer-search-panel-instance-1",
        },
        {
          id: "trace-2",
          at: "00:01",
          kind: "render-committed",
          summary: "CustomerSearchPanel render committed.",
          source: {
            file: "src/features/customers/CustomerSearchPanel.tsx",
            line: 31,
            symbol: "CustomerSearchPanel",
          },
          graphNodeId: "customer-search-panel",
          runtimeInstanceId: "customer-search-panel-instance-1",
        },
      ],
      "customer-search-panel-instance-1",
    );

    expect(result.summary).toBe("2 runtime event(s), 2 source-linked.");
    expect(result.nodes.map((node) => node.label)).toEqual([
      "trace: component-mounted",
      "trace: render-committed",
    ]);
    expect(result.nodes[0]?.detail).toContain(
      "instance:customer-search-panel-instance-1",
    );
  });

  test("getImpact summarizes rendered components, state, and hooks", () => {
    const result = getImpact(demoGraph, "customer-search-panel");

    expect(result.summary).toBe(
      "CustomerSearchPanel impacts 2 rendered component(s), 3 state node(s), 2 hook(s), 1 design-system usage(s), 2 prop boundary node(s), 1 context usage(s), 0 external store usage(s), 0 Redux action usage(s), and 0 Redux selector usage(s).",
    );
    expect(result.nodes.map((node) => node.label)).toEqual([
      "renders: SearchInput",
      "renders: CustomerCard",
      "owns state: query",
      "owns state: selectedCustomer",
      "owns state: isLoading",
      "uses hook: useEffect",
      "uses hook: useState",
      "design-system: SearchInput",
      "prop: onChange",
      "prop: value",
      "context: CustomerSearchContext",
    ]);
  });
});
