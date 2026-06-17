import { useState } from "react";

import { InventoryResults } from "./InventoryResults";
import { useInventorySearch } from "./useInventorySearch";

export function InventoryPanel() {
  const [query, setQuery] = useState("paper");
  const { isSearching, items } = useInventorySearch(query);

  return (
    <section aria-label="Inventory workspace">
      <input
        aria-label="Inventory search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div role="status">{isSearching ? "Searching inventory" : "Search complete"}</div>
      <InventoryResults items={items} />
    </section>
  );
}
