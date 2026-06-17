import { configureStore, createSelector, createSlice } from "@reduxjs/toolkit";

type InventoryFilterState = {
  readonly availability: "all" | "in-stock";
};

const initialState: InventoryFilterState = {
  availability: "all",
};

export const inventoryFilterSlice = createSlice({
  name: "inventoryFilter",
  initialState,
  reducers: {
    setAvailability(state, action: { readonly payload: InventoryFilterState["availability"] }) {
      state.availability = "all";
    },
  },
});

export const inventoryStore = configureStore({
  reducer: {
    inventoryFilter: inventoryFilterSlice.reducer,
  },
});

const selectInventoryFilterState = (state: { inventoryFilter: InventoryFilterState }) =>
  state.inventoryFilter;

export const selectInventoryAvailability = createSelector(
  [selectInventoryFilterState],
  (inventoryFilter) => inventoryFilter.availability,
);

export const { setAvailability } = inventoryFilterSlice.actions;
