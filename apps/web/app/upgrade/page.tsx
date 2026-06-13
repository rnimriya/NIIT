"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const PAYMENTS_URL =
  process.env.NEXT_PUBLIC_PAYMENTS_URL ?? "http://localhost:4006";

type Plan = { plan: string; name: string; priceInr: number; features: string[] };

export default function UpgradePage() {
  const [token, setToken] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const t = localStorage.getItem("neet_token");
    setToken(t);
    fetch(`${PAYMENTS_URL}/api/v1/payments/plans`)
      .then((r) => r.json())
      .then(setPlans)
      .catch(() => {});
    if (t) refreshCurrent(t);
  }, []);

  function refreshCurrent(t: string) {
    fetch(`${PAYMENTS_URL}/api/v1/entitlements`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCurrent(d.plan))
      .catch(() => {});
  }

  async function upgrade(plan: string) {
    if (!token) {
      setMsg("Sign in on the Tutor page first.");
      return;
    }
    setMsg("");
    const res = await fetch(`${PAYMENTS_URL}/api/v1/payments/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url; // Stripe Checkout
    } else if (data.devActivated) {
      setCurrent(data.entitlements.plan);
      setMsg(`Activated ${data.entitlements.plan} (dev mode — no Stripe key set).`);
    }
  }

  return (
    <main className="container">
      <Link href="/" className="meta">
        ← Dashboard
      </Link>
      <h2 className="brand" style={{ marginTop: 8 }}>
        Plans
      </h2>
      {current && (
        <p className="meta">
          Current plan: <span className="tag">{current}</span>
        </p>
      )}
      {msg && <p className="meta">{msg}</p>}

      <div className="grid">
        {plans.map((p) => (
          <div className="card" key={p.plan}>
            <h3>{p.name}</h3>
            <div className="big">
              {p.priceInr === 0 ? "Free" : `₹${p.priceInr}`}
              {p.priceInr > 0 && <span style={{ fontSize: 13, color: "var(--muted)" }}>/mo</span>}
            </div>
            <div style={{ margin: "10px 0" }}>
              {p.features.map((f) => (
                <div key={f} className="meta" style={{ margin: "3px 0" }}>
                  • {f}
                </div>
              ))}
            </div>
            <button
              className="btn"
              disabled={current === p.plan}
              onClick={() => upgrade(p.plan)}
            >
              {current === p.plan ? "Current" : p.priceInr === 0 ? "Downgrade" : "Upgrade"}
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
