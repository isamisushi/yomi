import type { Browser, Page } from "playwright";

import type { SourceLocation, TraceEvent } from "./yomi-ir";

export type BrowserVerificationResult = {
  readonly status: "failed" | "passed";
  readonly summary: string;
  readonly trace: readonly TraceEvent[];
};

type BrowserVerificationMode = "current" | "toggle-fixed";

type BrowserSnapshot = {
  readonly query: string;
  readonly renderedCustomer: string;
  readonly statusText: string;
};

const effectSource: SourceLocation = {
  file: "src/features/customers/CustomerSearchPanel.tsx",
  line: 42,
  symbol: "useEffect",
};

const customerCardSource: SourceLocation = {
  file: "src/features/customers/CustomerCard.tsx",
  line: 18,
  symbol: "CustomerCard",
};

export async function verifyStaleResponseInBrowser(input: {
  readonly mode?: BrowserVerificationMode;
  readonly url: string;
}): Promise<BrowserVerificationResult> {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(input.url);
    if (input.mode === "toggle-fixed") {
      await page.getByTestId("toggle-fix").click();
    }
    const snapshot = await readBrowserSnapshot(page);
    const passed = snapshot.query.toLowerCase() === "grace" &&
      snapshot.renderedCustomer === "Grace Hopper";

    return {
      status: passed ? "passed" : "failed",
      summary: passed
        ? "Browser verification passed: rendered customer matches the visible query."
        : `Browser verification failed: query is "${snapshot.query}" but rendered customer is ${snapshot.renderedCustomer}.`,
      trace: browserTrace(snapshot, passed),
    };
  } finally {
    await closeBrowser(browser);
  }
}

async function readBrowserSnapshot(page: Page): Promise<BrowserSnapshot> {
  await page.getByTestId("customer-search-input").waitFor({ state: "visible" });
  const query = await page.getByTestId("customer-search-input").inputValue();
  const renderedCustomer = await page.getByTestId("rendered-customer").innerText();
  const statusText = await page.getByTestId("customer-search-status").innerText();

  return {
    query,
    renderedCustomer,
    statusText,
  };
}

function browserTrace(snapshot: BrowserSnapshot, passed: boolean): readonly TraceEvent[] {
  return [
    {
      id: "browser-1",
      at: "browser",
      kind: "action-requested",
      summary: `Browser opened customer search UI with query "${snapshot.query}".`,
      source: effectSource,
      graphNodeId: "edit-query-action",
      correlationId: "customer-search",
    },
    {
      id: "browser-2",
      at: "browser",
      kind: "state-committed",
      summary: `Rendered customer is ${snapshot.renderedCustomer}. Status: ${snapshot.statusText}`,
      source: customerCardSource,
      graphNodeId: "selected-customer-state",
      correlationId: "customer-search",
    },
    {
      id: "browser-3",
      at: "browser",
      kind: passed ? "response-resolved" : "violation-detected",
      summary: passed
        ? "Browser-observed UI is consistent."
        : "Browser-observed UI is inconsistent with the latest visible query.",
      source: passed ? effectSource : customerCardSource,
      graphNodeId: passed ? "customer-search-effect" : "selected-customer-state",
      correlationId: "customer-search",
    },
  ];
}

async function closeBrowser(browser: Browser): Promise<void> {
  await browser.close();
}

async function loadPlaywright(): Promise<typeof import("playwright")> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<typeof import("playwright")>;
  return dynamicImport("playwright");
}
