import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

export function InstrumentedPanel() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("query:");

  useEffect(() => {
    setStatus(`query:${query}`);
  }, [query]);

  return (
    <main>
      <label>
        Query
        <input
          aria-label="Runtime query"
          data-testid="runtime-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <output data-testid="runtime-status">{status}</output>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<InstrumentedPanel />);
