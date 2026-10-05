import { useEffect, useState } from "react";
import { readCart, writeCart } from "./cart";

/** Returns tab-local storage when permitted; the cart still works in memory when access is blocked. */
function tabStorage() {
  try { return window.sessionStorage; } catch { return undefined; }
}

/** Owns the recoverable cart draft; menu quotes and customer fields belong to the ordering page. */
export default function useGuestCart() {
  // Tab-local intent survives refresh without storing customer details, tokens or trusted prices.
  const [intent, setIntent] = useState(() => readCart(tabStorage()));
  useEffect(() => { writeCart(tabStorage(), intent); }, [intent]);
  return [intent, setIntent];
}
