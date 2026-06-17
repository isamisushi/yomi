import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { CustomerList } from "./CustomerList";

type Customer = {
  readonly id: string;
  readonly name: string;
  readonly workspaceId: string;
};

async function fetchCustomers(workspaceId: string): Promise<readonly Customer[]> {
  const response = await fetch(`/api/workspaces/${workspaceId}/customers`);
  return response.json() as Promise<readonly Customer[]>;
}

async function saveCustomer(customer: Customer): Promise<Customer> {
  const response = await fetch(`/api/customers/${customer.id}`, {
    body: JSON.stringify(customer),
    method: "PUT",
  });
  return response.json() as Promise<Customer>;
}

export function CustomerEditor() {
  const workspaceId = "northwind";
  const queryClient = useQueryClient();
  const [customer, setCustomer] = useState<Customer>({
    id: "customer-1",
    name: "Ada Lovelace",
    workspaceId,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers", workspaceId],
    queryFn: () => fetchCustomers(workspaceId),
  });

  async function handleSaveCustomer() {
    const updatedCustomer = await saveCustomer(customer);
    queryClient.setQueryData(["customer", customer.id], updatedCustomer);
  }

  return (
    <section aria-label="Customer workspace">
      <input
        aria-label="Customer name"
        value={customer.name}
        onChange={(event) => setCustomer({ ...customer, name: event.target.value })}
      />
      <button type="button" aria-label="Save customer" onClick={handleSaveCustomer}>
        Save
      </button>
      <CustomerList customers={customers} />
    </section>
  );
}
