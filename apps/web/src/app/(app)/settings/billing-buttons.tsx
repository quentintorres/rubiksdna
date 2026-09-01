"use client";

import { useState, useTransition } from "react";
import { startCheckout } from "./billing-actions";

export function BillingButtons() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const go = (mode: "seats" | "report_pack") =>
    startTransition(async () => {
      setError(null);
      try {
        const { url } = await startCheckout(mode);
        if (url) window.location.href = url;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Checkout unavailable");
      }
    });

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button className="btn" onClick={() => go("seats")} disabled={pending}>
          Manage seats
        </button>
        <button className="btn btn-secondary" onClick={() => go("report_pack")} disabled={pending}>
          Buy report pack (25)
        </button>
      </div>
      {error && (
        <p className="text-[12px]" style={{ color: "var(--fail)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
