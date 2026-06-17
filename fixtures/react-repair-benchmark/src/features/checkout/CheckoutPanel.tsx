import { useReducer } from "react";

import { cartReducer } from "./cartReducer";
import { CheckoutTotal } from "./CheckoutTotal";

export function CheckoutPanel() {
  const [cart, dispatch] = useReducer(cartReducer, {
    shippingMethod: "ground",
    shippingRate: 8,
    subtotal: 120,
  });

  return (
    <section aria-label="Checkout workspace">
      <label>
        Shipping
        <select
          aria-label="Shipping method"
          value={cart.shippingMethod}
          onChange={(event) =>
            dispatch({
              method: event.target.value === "express" ? "express" : "ground",
              type: "shippingChanged",
            })
          }
        >
          <option value="ground">Ground</option>
          <option value="express">Express</option>
        </select>
      </label>
      <CheckoutTotal total={cart.subtotal + cart.shippingRate} />
    </section>
  );
}
