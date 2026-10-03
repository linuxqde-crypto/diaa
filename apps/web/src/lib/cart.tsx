'use client';

/**
 * Client-side cart store (localStorage) — mirrors server `normalizeCart` rules:
 * merge duplicate product rows, min 1 / max 20 per line, max 30 distinct lines.
 * Prices are display-only; the server re-computes everything at checkout.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CartLine } from './types';

const KEY = 'kroto.cart.v1';
const MAX_QTY = 20;
const MAX_LINES = 30;

interface CartCtx {
  lines: CartLine[];
  count: number;
  subtotalUsd: number;
  add: (line: Omit<CartLine, 'qty'>, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  ready: boolean;
}

const Ctx = createContext<CartCtx | null>(null);

function normalize(lines: CartLine[]): CartLine[] {
  const map = new Map<string, CartLine>();
  for (const l of lines) {
    const prev = map.get(l.productId);
    const qty = Math.min(MAX_QTY, Math.max(1, (prev?.qty ?? 0) + l.qty));
    map.set(l.productId, { ...l, qty });
  }
  return [...map.values()].slice(0, MAX_LINES);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage on mount (avoids SSR/client mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLines(normalize(JSON.parse(raw)));
    } catch {
      /* corrupted storage → start fresh */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(KEY, JSON.stringify(lines));
  }, [lines, ready]);

  const add = useCallback((line: Omit<CartLine, 'qty'>, qty = 1) => {
    setLines((cur) => normalize([...cur, { ...line, qty }]));
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setLines((cur) =>
      normalize(
        cur
          .map((l) => (l.productId === productId ? { ...l, qty: Math.min(MAX_QTY, Math.max(0, qty)) } : l))
          .filter((l) => l.qty > 0),
      ),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setLines((cur) => cur.filter((l) => l.productId !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartCtx>(() => {
    const count = lines.reduce((s, l) => s + l.qty, 0);
    const subtotalUsd = Math.round(lines.reduce((s, l) => s + l.priceUsd * l.qty, 0) * 100) / 100;
    return { lines, count, subtotalUsd, add, setQty, remove, clear, ready };
  }, [lines, add, setQty, remove, clear, ready]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

export const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
