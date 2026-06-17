import { useEffect, useState } from "react";

type InventoryItem = {
  readonly id: string;
  readonly name: string;
};

async function searchInventory(query: string): Promise<readonly InventoryItem[]> {
  const response = await fetch(`/api/inventory?query=${query}`);
  return response.json() as Promise<readonly InventoryItem[]>;
}

export function useInventorySearch(query: string) {
  const [items, setItems] = useState<readonly InventoryItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    setIsSearching(true);
    const timer = window.setTimeout(() => {
      searchInventory(query).then((nextItems) => {
        setItems(nextItems);
        setIsSearching(false);
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  return {
    isSearching,
    items,
  };
}
