"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const TESTS_URL = process.env.NEXT_PUBLIC_TESTS_URL ?? "http://localhost:4003";

type Option = { key: string; text: string };
type Question = { id: string; subject: string; stem: string; options: Option[] };
type Result = {
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  unattempted: number;
  perSubject: Record<string, { correct: number; total: number }>;
  weakConcepts: { conceptId: string; name: string; accuracy: number }[];
  persisted: boolean;
};

export default function DiagnosticPage() {
  const [token, setToken] = useState<string | null>(null);
  const [testId, setTestId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setToken(localStorage.getItem("neet_token")), []);

  const authHeaders = (): Record<string, string> =>
    token ? { Authorization: `Bearer ${token}` } : {};

  async function start() {
    setBusy(true);
    setResult(null);
    setAnswers({});
    const res = await fetch(`${TESTS_URL}/api/v1/test/diagnostic`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
    });
    const data = await res.json();
    setTestId(data.testId);
    setQuestions(data.questions);
    setBusy(false);
  }

  async function submit() {
    if (!testId) return;
    setBusy(true);
    const res = await fetch(`${TESTS_URL}/api/v1/test/${testId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        responses: questions.map((q) => ({
          questionId: q.id,
          selected: answers[q.id] ?? null,
        })),
      }),
    });
    setResult(await res.json());
    setQuestions([]);
    setBusy(false);
  }

  return (
    <main className="container">
      <Link href="/" className="meta">
        ← Dashboard
      </Link>
      <h2 className="brand" style={{ marginTop: 8 }}>
        Diagnostic Test
      </h2>
      <p className="meta">
        {token
          ? "Signed in — your mastery will be saved."
          : "Not signed in (sign in on the Tutor page to save mastery)."}
      </p>

      {!questions.length && !result && (
        <button className="btn" onClick={start} disabled={busy}>
          {busy ? "Loading…" : "Start diagnostic"}
        </button>
      )}

      {questions.map((q, i) => (
        <div className="card" key={q.id} style={{ marginBottom: 12 }}>
          <h3>
            Q{i + 1} · {q.subject}
          </h3>
          <div style={{ marginBottom: 10 }}>{q.stem}</div>
          {q.options.map((o) => (
            <label key={o.key} style={{ display: "block", margin: "4px 0", cursor: "pointer" }}>
              <input
                type="radio"
                name={q.id}
                checked={answers[q.id] === o.key}
                onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.key }))}
              />{" "}
              <b>{o.key})</b> {o.text}
            </label>
          ))}
        </div>
      ))}

      {questions.length > 0 && (
        <button className="btn" onClick={submit} disabled={busy}>
          {busy ? "Scoring…" : "Submit"}
        </button>
      )}

      {result && (
        <div>
          <div className="card" style={{ marginBottom: 12 }}>
            <h3>Result {result.persisted ? "(saved)" : "(not saved)"}</h3>
            <div className="big">
              {result.score} / {result.maxScore}
            </div>
            <div className="meta">
              {result.correct} correct · {result.wrong} wrong · {result.unattempted} skipped
            </div>
          </div>

          <div className="grid">
            {Object.entries(result.perSubject).map(([subj, s]) => (
              <div className="card" key={subj}>
                <h3>{subj}</h3>
                <div className="big">
                  {s.correct}/{s.total}
                </div>
              </div>
            ))}
          </div>

          {result.weakConcepts.length > 0 && (
            <div className="card">
              <h3>Focus next (weak concepts)</h3>
              {result.weakConcepts.map((c) => (
                <div key={c.conceptId} style={{ margin: "6px 0" }}>
                  <span className="tag">{Math.round(c.accuracy * 100)}%</span> {c.name}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button className="btn" onClick={start}>
              Retake
            </button>{" "}
            <Link href="/tutor" className="meta">
              Ask the tutor about a weak topic →
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
