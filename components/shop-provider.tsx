"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { Check, X } from "lucide-react";
import type { CartItem } from "@/lib/types";
import { track } from "@/lib/client-events";
type ShopContext = {
  items: CartItem[];
  add: (id: string, quantity?: number) => void;
  update: (id: string, quantity: number) => void;
  clear: () => void;
  count: number;
  notify: (message: string) => void;
};
const Context = createContext<ShopContext | null>(null);
export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState("");
  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem("cris-cart-v2") || "[]");
      if (Array.isArray(data))
        setItems(
          data
            .filter(
              (x: CartItem) =>
                typeof x.product_id === "string" &&
                Number.isInteger(x.quantity) &&
                x.quantity > 0 &&
                x.quantity <= 99,
            )
            .slice(0, 50),
        );
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem("cris-cart-v2", JSON.stringify(items));
      } catch {}
  }, [items, ready]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  const notify = useCallback((message: string) => setToast(message), []);
  const add = useCallback((id: string, quantity = 1) => {
    setItems((old) => {
      const existing = old.find((x) => x.product_id === id);
      return existing
        ? old.map((x) =>
            x.product_id === id
              ? { ...x, quantity: Math.min(99, x.quantity + quantity) }
              : x,
          )
        : [...old, { product_id: id, quantity }];
    });
    track("cart_add", [id]);
    setToast("Um pouquinho de diversão no seu carrinho!");
  }, []);
  const update = (id: string, quantity: number) =>
    setItems((old) =>
      quantity <= 0
        ? old.filter((x) => x.product_id !== id)
        : old.map((x) =>
            x.product_id === id
              ? { ...x, quantity: Math.min(99, quantity) }
              : x,
          ),
    );
  return (
    <Context.Provider
      value={{
        items,
        add,
        update,
        clear: () => setItems([]),
        count: items.reduce((s, x) => s + x.quantity, 0),
        notify,
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-icon">
            <Check size={18} />
          </span>
          {toast}
          <button aria-label="Fechar aviso" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function useShop() {
  const context = useContext(Context);
  if (!context) throw new Error("ShopProvider ausente");
  return context;
}
