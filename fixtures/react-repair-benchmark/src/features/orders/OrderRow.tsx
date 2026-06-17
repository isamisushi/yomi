type OrderRowProps = {
  readonly order: {
    readonly id: string;
    readonly status: string;
    readonly title: string;
  };
};

export function OrderRow({ order }: OrderRowProps) {
  return (
    <article aria-label="Order row">
      <strong>{order.title}</strong>
      <span>{order.status}</span>
    </article>
  );
}
