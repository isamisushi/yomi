export function InventoryAvailabilityLabel({
  availability,
}: {
  readonly availability: string;
}) {
  return <p aria-label="Inventory availability">Availability: {availability}</p>;
}
