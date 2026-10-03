import { useEffect, useState } from "react";
import { readCart, writeCart } from "./cart";

function tabStorage() {
  try { return window.sessionStorage; } catch { return undefined; }
}

export default function useGuestCart() {
  // Tab-local intent survives refresh without storing customer details, tokens or trusted prices.
  const [intent, setIntent] = useState(() => readCart(tabStorage()));
  useEffect(() => { writeCart(tabStorage(), intent); }, [intent]);
  return [intent, setIntent];
}
