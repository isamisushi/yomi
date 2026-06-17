import { useEffect, useState } from "react";

import { OrderRow } from "./OrderRow";

type Order = {
  readonly id: string;
  readonly status: "active" | "pending";
  readonly title: string;
};

async function fetchOrders(status: string): Promise<readonly Order[]> {
  const response = await fetch(`/api/orders?status=${status}`);
  return response.json() as Promise<readonly Order[]>;
}

export function OrdersPanel() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [orders, setOrders] = useState<readonly Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  function handleStatusChange(event: React.ChangeEvent<HTMLSelectElement>) {
    setStatusFilter(event.target.value);
    setIsLoading(true);
  }

  useEffect(() => {
    setIsLoading(true);
    fetchOrders(statusFilter).then((nextOrders) => {
      setOrders(nextOrders);
      setIsLoading(false);
    });
  }, [statusFilter]);

  return (
    <section aria-label="Orders workspace">
      <label>
        Status
        <select aria-label="Status filter" value={statusFilter} onChange={handleStatusChange}>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
        </select>
      </label>
      <div role="status">{isLoading ? "Loading orders" : "Orders loaded"}</div>
      <div aria-label="Order list">
        {orders.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </div>
    </section>
  );
}
