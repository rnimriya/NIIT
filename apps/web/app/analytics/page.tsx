"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const ANALYTICS_URL =
  process.env.NEXT_PUBLIC_ANALYTICS_URL ?? "http://localhost:4008";

type Stage = { stage: string; count: number };

export default function AnalyticsPage() {
  const [funnel, setFunnel] = useState<Stage[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${ANALYTICS_URL}/api/v1/analytics/funnel`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setFunnel)
      .catch(() => setError(true));
  }, []);

  const max = Math.max(1, ...funnel.map((s) => s.count));

  return (
    <main className="container">
      <Link href="/" className="meta">
        ← Dashboard
      </Link>
      <h2 className="brand" style={{ marginTop: 8 }}>
        Analytics · Funnel
      </h2>
      <p className="meta">
        Live from ClickHouse — events flow in via the Kafka stream and the track API.
        (In production this is admin-gated.)
      </p>

      {error && <p className="meta">Analytics service unavailable.</p>}

      <div style={{ marginTop: 16 }}>
        {funnel.map((s) => (
          <div className="card" key={s.stage} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{s.stage}</strong>
              <span className="tag">{s.count}</span>
            </div>
            <div
              style={{
                marginTop: 8,
                height: 8,
                borderRadius: 6,
                background: "#0e1426",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(s.count / max) * 100}%`,
                  height: "100%",
                  background: "var(--accent)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
