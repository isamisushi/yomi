type CheckoutTotalProps = {
  readonly total: number;
};

export function CheckoutTotal({ total }: CheckoutTotalProps) {
  return (
    <output aria-label="Checkout total">
      {new Intl.NumberFormat("en-US", {
        currency: "USD",
        style: "currency",
      }).format(total)}
    </output>
  );
}
