"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STUDY_URL = process.env.NEXT_PUBLIC_STUDY_URL ?? "http://localhost:4005";

type Task = { type: string; concept: string; minutes: number };
type Day = { day: number; focus: string; tasks: Task[] };
type Plan = { summary: string; days: Day[] };

export default function PlanPage() {
  const [token, setToken] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [source, setSource] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const t = localStorage.getItem("neet_token");
    setToken(t);
    if (!t) return;
    fetch(`${STUDY_URL}/api/v1/study/plan`, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && (setPlan(d.plan), setSource(d.source)))
      .catch(() => {});
  }, []);

  async function generate() {
    if (!token) return;
    setBusy(true);
    setMsg("");
    const res = await fetch(`${STUDY_URL}/api/v1/study/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ horizonDays: 7 }),
    });
    if (res.ok) {
      const d = await res.json();
      setPlan(d.plan);
      setSource(d.source);
    } else {
      setMsg("Take a diagnostic first so the planner has data to work with.");
    }
    setBusy(false);
  }

  return (
    <main className="container">
      <Link href="/" className="meta">
        ← Dashboard
      </Link>
      <h2 className="brand" style={{ marginTop: 8 }}>
        AI Study Plan
      </h2>

      {!token && (
        <p className="meta">Sign in on the Tutor page to generate a personalised plan.</p>
      )}

      {token && (
        <button className="btn" onClick={generate} disabled={busy}>
          {busy ? "Planning…" : plan ? "Regenerate plan" : "Generate plan"}
        </button>
      )}
      {msg && <p className="meta">{msg}</p>}

      {plan && (
        <div style={{ marginTop: 16 }}>
          <div className="card" style={{ marginBottom: 12 }}>
            <h3>Plan {source !== "deterministic" ? `· ${source}` : ""}</h3>
            <div>{plan.summary}</div>
          </div>
          {plan.days.map((d) => (
            <div className="card" key={d.day} style={{ marginBottom: 10 }}>
              <h3>
                Day {d.day} · focus: {d.focus}
              </h3>
              {d.tasks.map((t, i) => (
                <div key={i} style={{ margin: "4px 0" }}>
                  <span className="tag">{t.type}</span> {t.concept}{" "}
                  <span className="meta">· {t.minutes} min</span>
                </div>
              ))}
            </div>
          ))}
          <Link href="/tutor" className="meta">
            Stuck on a topic? Ask the tutor →
          </Link>
        </div>
      )}
    </main>
  );
}
