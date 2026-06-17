export type ShippingMethod = "ground" | "express";

export type CartState = {
  readonly subtotal: number;
  readonly shippingMethod: ShippingMethod;
  readonly shippingRate: number;
};

export type CartAction = {
  readonly method: ShippingMethod;
  readonly type: "shippingChanged";
};

const shippingRates: Record<ShippingMethod, number> = {
  express: 24,
  ground: 8,
};

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "shippingChanged":
      return {
        ...state,
        shippingMethod: action.method,
        shippingRate: state.shippingRate,
      };
  }
}
