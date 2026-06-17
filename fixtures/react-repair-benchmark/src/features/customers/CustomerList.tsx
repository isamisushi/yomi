type CustomerListProps = {
  readonly customers: readonly {
    readonly id: string;
    readonly name: string;
  }[];
};

export function CustomerList({ customers }: CustomerListProps) {
  return (
    <section aria-label="Customer list">
      {customers.map((customer) => (
        <article key={customer.id}>
          <strong>{customer.name}</strong>
        </article>
      ))}
    </section>
  );
}
