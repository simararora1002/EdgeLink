"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTRPC } from "@/trpc/react";

/**
 * Shows "used / 5" as dots, plus a countdown until the next slot frees up.
 *
 * Display only: it reads `links.quota`, which never spends quota. The real
 * enforcement is the atomic check inside `links.create`, so if this meter
 * is ever stale the server still decides correctly.
 */
export function QuotaMeter() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, dataUpdatedAt } = useQuery(trpc.links.quota.queryOptions());

  // Tick once a second while a countdown is running.
  const [now, setNow] = useState(() => Date.now());
  const counting = !!data && data.used > 0;
  useEffect(() => {
    if (!counting) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [counting]);

  // The server returned "ms until the next slot frees" at fetch time; subtract
  // how long ago that was. This uses only the browser's clock, so a skewed
  // server clock can't distort it.
  const msLeft = data ? data.nextFreeInMs - (now - dataUpdatedAt) : 0;
  const secondsLeft = Math.max(0, Math.ceil(msLeft / 1000));

  // When the oldest slot expires, re-fetch the real numbers from the server.
  useEffect(() => {
    if (counting && msLeft <= 0) {
      void queryClient.invalidateQueries({ queryKey: trpc.links.quota.queryKey() });
    }
  }, [counting, msLeft, queryClient, trpc]);

  if (!data) {
    return <div className="quota quota-loading" aria-hidden />;
  }

  const full = data.used >= data.limit;
  const remaining = data.limit - data.used;

  return (
    <div className={`quota ${full ? "quota-full" : ""}`} aria-live="polite">
      <div className="quota-dots" aria-hidden>
        {Array.from({ length: data.limit }, (_, i) => (
          <span key={i} className={`dot ${i < data.used ? "dot-used" : ""}`} />
        ))}
      </div>
      <span className="quota-text">
        {full ? (
          <>Limit reached · next slot in <strong>{secondsLeft}s</strong></>
        ) : (
          <>
            <strong>{remaining}</strong> of {data.limit} left
            {data.used > 0 && <> · next slot frees in {secondsLeft}s</>}
          </>
        )}
      </span>
    </div>
  );
}
