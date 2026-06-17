import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileCode2,
  GitBranch,
  Play,
  Search,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  createYomiAction,
  useYomiRenderTrace,
  useYomiTraceEffect,
  useYomiTracedState,
  type YomiTraceMetadata,
} from "./react-instrumentation";
import {
  demoGraph,
  getActionPath,
  getComponentOwner,
  getDataPath,
  getEffectsTriggeredBy,
  getImpact,
  getRepairBrief,
  getRepairBriefFromUi,
  type QueryResult,
  type SourceLocation,
  type TraceEvent,
} from "./yomi-ir";

type Scenario = "broken" | "fixed";

const customerSearchEffectTrace: YomiTraceMetadata = {
  name: "customer search",
  source: {
    file: "src/features/customers/CustomerSearchPanel.tsx",
    line: 42,
    symbol: "useEffect",
  },
  graphNodeId: "customer-search-effect",
  correlationId: "customer-search-demo",
};

const selectedCustomerTrace: YomiTraceMetadata = {
  name: "selected customer",
  source: {
    file: "src/features/customers/CustomerCard.tsx",
    line: 18,
    symbol: "CustomerCard",
  },
  graphNodeId: "selected-customer-state",
  correlationId: "customer-search-demo",
};

const editQueryActionTrace: YomiTraceMetadata = {
  name: "edit query",
  source: {
    file: "src/features/customers/CustomerSearchPanel.tsx",
    line: 73,
    symbol: "SearchInput",
  },
  graphNodeId: "edit-query-action",
  correlationId: "customer-search-demo",
};

const brokenTrace: readonly TraceEvent[] = [
  {
    id: "broken-1",
    at: "00:00",
    kind: "action-requested",
    summary: 'User types "ada", then quickly types "grace".',
  },
  {
    id: "broken-2",
    at: "00:08",
    kind: "request-started",
    summary: "Two search requests are now in flight.",
    source: {
      file: "src/features/customers/CustomerSearchPanel.tsx",
      line: 45,
      symbol: "fetchCustomer",
    },
  },
  {
    id: "broken-3",
    at: "00:34",
    kind: "state-committed",
    summary: "The older Ada response returns last and overwrites the Grace result.",
    source: {
      file: "src/features/customers/CustomerSearchPanel.tsx",
      line: 50,
      symbol: "setSelectedCustomer",
    },
  },
  {
    id: "broken-4",
    at: "00:35",
    kind: "violation-detected",
    summary: 'Input says "grace" but the rendered customer is Ada Lovelace.',
    source: {
      file: "src/features/customers/CustomerSearchPanel.tsx",
      line: 42,
      symbol: "useEffect",
    },
  },
];

const fixedTrace: readonly TraceEvent[] = [
  {
    id: "fixed-1",
    at: "00:00",
    kind: "action-requested",
    summary: 'User types "ada", then quickly types "grace".',
  },
  {
    id: "fixed-2",
    at: "00:08",
    kind: "request-started",
    summary: "The new request cancels or invalidates the previous request.",
    source: {
      file: "src/features/customers/CustomerSearchPanel.tsx",
      line: 44,
      symbol: "AbortController",
    },
  },
  {
    id: "fixed-3",
    at: "00:19",
    kind: "state-committed",
    summary: "Grace response commits to selectedCustomer.",
    source: {
      file: "src/features/customers/CustomerSearchPanel.tsx",
      line: 55,
      symbol: "setSelectedCustomer",
    },
  },
  {
    id: "fixed-4",
    at: "00:34",
    kind: "response-resolved",
    summary: "Older Ada response returns but is ignored.",
    source: {
      file: "src/features/customers/CustomerSearchPanel.tsx",
      line: 52,
      symbol: "if (signal.aborted)",
    },
  },
];

const agentQuestions = [
  {
    id: "owner",
    label: "Who owns this UI?",
    result: getComponentOwner(demoGraph, "search-input-node"),
  },
  {
    id: "path",
    label: "What happens when it changes?",
    result: getActionPath(demoGraph, "edit-query-action"),
  },
  {
    id: "data",
    label: "Which data/cache changes?",
    result: getDataPath(demoGraph, "edit-query-action"),
  },
  {
    id: "effect",
    label: "Which effect reruns?",
    result: getEffectsTriggeredBy(demoGraph, "query"),
  },
  {
    id: "impact",
    label: "What might break?",
    result: getImpact(demoGraph, "customer-search-panel"),
  },
  {
    id: "brief",
    label: "What should the agent edit?",
    result: getRepairBrief(demoGraph, "edit-query-action"),
  },
  {
    id: "briefFromUi",
    label: "Start from visible UI",
    result: getRepairBriefFromUi(demoGraph, "Customer search"),
  },
] as const;

type AgentQuestionId = (typeof agentQuestions)[number]["id"];

export function App() {
  const [scenario, setScenario] = useYomiTracedState<Scenario>(
    selectedCustomerTrace,
    "broken",
  );
  const [questionId, setQuestionId] = useState<AgentQuestionId>("path");
  const activeQuestion = agentQuestions.find((question) => question.id === questionId);
  const queryResult = useMemo<QueryResult>(
    () => (activeQuestion ?? agentQuestions[0]).result,
    [activeQuestion],
  );
  const isFixed = scenario === "fixed";
  const trace = isFixed ? fixedTrace : brokenTrace;

  useYomiTraceEffect(customerSearchEffectTrace, () => undefined, [], {
    clearBeforeRun: true,
  });

  useYomiRenderTrace(
    selectedCustomerTrace,
    () =>
      isFixed
        ? "Demo rendered fixed state: query grace maps to Grace Hopper."
        : "Demo rendered broken state: query grace maps to Ada Lovelace.",
    [isFixed],
  );

  return (
    <main className="app-shell">
      <section className="hero-band">
        <div className="hero-content">
          <p className="eyebrow">Yomi demo</p>
          <h1>Give coding agents a map of your React frontend</h1>
          <p className="hero-copy">
            This demo shows one workflow: a user reports a UI bug, Yomi tells the
            agent which React component, state, action, and effect own the
            behavior, then verification proves whether the patch worked.
          </p>
        </div>
      </section>

      <section className="flow-strip" aria-label="Demo flow">
        <FlowStep
          icon={<ClipboardList size={18} />}
          title="1. Bug report"
          body='Search box says "grace" but the page renders Ada.'
        />
        <ArrowRight className="flow-arrow" size={18} aria-hidden="true" />
        <FlowStep
          icon={<Search size={18} />}
          title="2. Yomi context"
          body="Yomi links the visible bug to source, state, action, effect, and impact."
        />
        <ArrowRight className="flow-arrow" size={18} aria-hidden="true" />
        <FlowStep
          icon={<Wrench size={18} />}
          title="3. Agent patch"
          body="The agent edits the effect owner, not the harmless display component."
        />
      </section>

      <section className="workspace-grid" aria-label="Yomi frontend agent demo">
        <BrokenAppCard
          scenario={scenario}
          onScenarioChange={createYomiAction(editQueryActionTrace, setScenario)}
        />
        <AgentContextCard
          isFixed={isFixed}
          questionId={questionId}
          queryResult={queryResult}
          onQuestionChange={setQuestionId}
        />
        <VerificationCard isFixed={isFixed} trace={trace} />
      </section>
    </main>
  );
}

function FlowStep({
  body,
  icon,
  title,
}: {
  readonly body: string;
  readonly icon: React.ReactNode;
  readonly title: string;
}) {
  return (
    <article className="flow-step">
      <div className="flow-icon">{icon}</div>
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    </article>
  );
}

function BrokenAppCard({
  scenario,
  onScenarioChange,
}: {
  readonly scenario: Scenario;
  readonly onScenarioChange: (scenario: Scenario) => void;
}) {
  const isFixed = scenario === "fixed";

  return (
    <section className="panel app-card" aria-labelledby="app-card-title">
      <div className="panel-header">
        <div>
          <p className="eyebrow">What the user sees</p>
          <h2 id="app-card-title">A React UI with an async bug</h2>
        </div>
        <div className="segmented-control" aria-label="Scenario">
          <button
            className={!isFixed ? "active" : ""}
            type="button"
            onClick={() => onScenarioChange("broken")}
          >
            Broken
          </button>
          <button
            className={isFixed ? "active" : ""}
            type="button"
            onClick={() => onScenarioChange("fixed")}
          >
            Fixed
          </button>
        </div>
      </div>

      <div className="mock-app">
        <label className="field-label">
          Customer search
          <span className="input-shell">
            <Search size={16} aria-hidden="true" />
            <input
              value="grace"
              readOnly
              aria-label="Customer search"
              data-testid="customer-search-input"
            />
          </span>
        </label>

        <div
          className={isFixed ? "status good" : "status bad"}
          data-testid="customer-search-status"
        >
          {isFixed ? (
            <CheckCircle2 size={18} aria-hidden="true" />
          ) : (
            <AlertTriangle size={18} aria-hidden="true" />
          )}
          <span>
            {isFixed
              ? "Result matches the latest query"
              : "Older response overwrote the latest query"}
          </span>
        </div>

        <div className="customer-card" data-testid="customer-card">
          <div className="avatar">{isFixed ? "GH" : "AL"}</div>
          <div>
            <p className="card-label">Rendered customer</p>
            <h3 data-testid="rendered-customer">
              {isFixed ? "Grace Hopper" : "Ada Lovelace"}
            </h3>
            <p>
              {isFixed
                ? 'Correct for query "grace"'
                : 'Wrong for query "grace"'}
            </p>
          </div>
        </div>

        <button
          className="primary-action"
          type="button"
          data-testid="toggle-fix"
          onClick={() => onScenarioChange(isFixed ? "broken" : "fixed")}
        >
          <Play size={16} aria-hidden="true" />
          {isFixed ? "Show broken case" : "Show agent fix"}
        </button>
      </div>
    </section>
  );
}

function AgentContextCard({
  isFixed,
  questionId,
  queryResult,
  onQuestionChange,
}: {
  readonly isFixed: boolean;
  readonly questionId: AgentQuestionId;
  readonly queryResult: QueryResult;
  readonly onQuestionChange: (id: AgentQuestionId) => void;
}) {
  return (
    <section className="panel context-card" aria-labelledby="context-title">
      <div className="panel-header">
        <div>
          <p className="eyebrow">What Yomi gives the agent</p>
          <h2 id="context-title">A source-linked repair brief</h2>
        </div>
        <FileCode2 size={22} aria-hidden="true" />
      </div>

      <div className="repair-brief">
        <BriefRow label="Observed bug" value="Search input and rendered customer disagree." />
        <BriefRow
          label="Edit this"
          value="CustomerSearchPanel.tsx useEffect that fetches customers."
          source={{
            file: "src/features/customers/CustomerSearchPanel.tsx",
            line: 42,
            symbol: "useEffect",
          }}
        />
        <BriefRow
          label="Do not start here"
          value="CustomerCard only renders the stale state; it does not cause the bug."
          source={{
            file: "src/features/customers/CustomerCard.tsx",
            line: 18,
            symbol: "CustomerCard",
          }}
        />
        <BriefRow
          label="Patch shape"
          value={
            isFixed
              ? "Abort or ignore stale responses before committing selectedCustomer."
              : "Add cancellation/stale-response guard before setSelectedCustomer."
          }
        />
      </div>

      <div className="question-tabs" role="tablist" aria-label="Agent questions">
        {agentQuestions.map((question) => (
          <button
            key={question.id}
            className={question.id === questionId ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={question.id === questionId}
            onClick={() => onQuestionChange(question.id)}
          >
            {question.label}
          </button>
        ))}
      </div>

      <div className="query-result">
        <code>{queryResult.query}</code>
        <p>{queryResult.summary}</p>
      </div>

      <div className="source-list">
        {queryResult.nodes.map((node) => (
          <SourceCard
            key={`${node.source.file}:${node.source.line}:${node.label}`}
            detail={node.detail}
            label={node.label}
            source={node.source}
          />
        ))}
      </div>
    </section>
  );
}

function BriefRow({
  label,
  source,
  value,
}: {
  readonly label: string;
  readonly source?: SourceLocation;
  readonly value: string;
}) {
  return (
    <div className="brief-row">
      <span>{label}</span>
      <div>
        <p>{value}</p>
        {source ? <SourceInline source={source} /> : null}
      </div>
    </div>
  );
}

function VerificationCard({
  isFixed,
  trace,
}: {
  readonly isFixed: boolean;
  readonly trace: readonly TraceEvent[];
}) {
  return (
    <section className="panel verification-card" aria-labelledby="verification-title">
      <div className="panel-header">
        <div>
          <p className="eyebrow">How the agent checks its work</p>
          <h2 id="verification-title">Runtime trace</h2>
        </div>
        <span className={isFixed ? "pill good" : "pill bad"}>
          {isFixed ? "verified" : "failing"}
        </span>
      </div>

      <ol className="trace-list">
        {trace.map((event) => (
          <li key={event.id} className={`trace-event ${event.kind}`}>
            <time>{event.at}</time>
            <div>
              <strong>{event.kind}</strong>
              <p>{event.summary}</p>
              {event.source ? <SourceInline source={event.source} /> : null}
            </div>
          </li>
        ))}
      </ol>

      <div className={isFixed ? "verdict good" : "verdict bad"}>
        {isFixed ? <CheckCircle2 size={18} /> : <GitBranch size={18} />}
        <p>
          {isFixed
            ? "The trace proves the stale response no longer commits state."
            : "The trace points the agent to the effect that commits stale state."}
        </p>
      </div>
    </section>
  );
}

function SourceCard({
  detail,
  label,
  source,
}: {
  readonly detail: string;
  readonly label: string;
  readonly source: SourceLocation;
}) {
  return (
    <article className="source-card">
      <strong>{label}</strong>
      <p>{detail}</p>
      <SourceInline source={source} />
    </article>
  );
}

function SourceInline({ source }: { readonly source: SourceLocation }) {
  return (
    <code className="source-link">
      {source.file}:{source.line} · {source.symbol}
    </code>
  );
}
