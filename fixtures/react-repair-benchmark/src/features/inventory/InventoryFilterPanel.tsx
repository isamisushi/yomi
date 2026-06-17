import { InventoryAvailabilityLabel } from "./InventoryAvailabilityLabel";
import { selectInventoryAvailability, setAvailability } from "./inventoryFilterSlice";

function useAppSelector<T>(selector: (state: { inventoryFilter: { availability: string } }) => T) {
  return selector({ inventoryFilter: { availability: "all" } });
}

function useAppDispatch() {
  return (action: unknown) => action;
}

export function InventoryFilterPanel() {
  const dispatch = useAppDispatch();
  const availability = useAppSelector(selectInventoryAvailability);

  return (
    <section aria-label="Inventory availability filter">
      <button
        type="button"
        aria-label="Show in-stock inventory"
        onClick={() => dispatch(setAvailability("in-stock"))}
      >
        Show in-stock
      </button>
      <InventoryAvailabilityLabel availability={availability} />
    </section>
  );
}
