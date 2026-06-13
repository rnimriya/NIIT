"use client";

import { useEffect, useState } from "react";

const PREDICTION_URL =
  process.env.NEXT_PUBLIC_PREDICTION_URL ?? "http://localhost:4004";

type Lever = { conceptId: string; name: string; potentialGain: number };
type Prediction = {
  predictedScore: number;
  rankBand: string;
  confidence: number;
  coverage: number;
  levers: Lever[];
};

export default function PredictionCard() {
  const [token, setToken] = useState<string | null>(null);
  const [p, setP] = useState<Prediction | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("neet_token");
    setToken(t);
    if (!t) {
      setLoaded(true);
      return;
    }
    fetch(`${PREDICTION_URL}/api/v1/prediction`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setP(d))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Signed-out / no data → illustrative sample (matches the static dashboard).
  if (!token || (loaded && !p)) {
    return (
      <div className="card">
        <h3>Predicted Score</h3>
        <div className="big">612</div>
        <div className="meta">
          {token ? "Take a diagnostic to get your real prediction" : "Sign in + take a diagnostic for a live prediction"}
        </div>
      </div>
    );
  }

  if (!loaded || !p) {
    return (
      <div className="card">
        <h3>Predicted Score</h3>
        <div className="big">…</div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h3>Predicted Score (live)</h3>
        <div className="big">{p.predictedScore}<span style={{ fontSize: 14, color: "var(--muted)" }}> /720</span></div>
        <div className="meta">
          Rank {p.rankBand} · {Math.round(p.confidence * 100)}% confidence ·{" "}
          {Math.round(p.coverage * 100)}% syllabus covered
        </div>
      </div>
      {p.levers.length > 0 && (
        <div className="card">
          <h3>Biggest score levers</h3>
          {p.levers.slice(0, 3).map((l) => (
            <div key={l.conceptId} style={{ margin: "5px 0" }}>
              <span className="tag">+{l.potentialGain}</span> {l.name}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
