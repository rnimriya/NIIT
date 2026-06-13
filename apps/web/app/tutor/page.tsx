"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const AI_URL = process.env.NEXT_PUBLIC_AI_URL ?? "http://localhost:4001";
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:4002";

type Meta = {
  model: string;
  provider: string;
  fallbackUsed: boolean;
  cacheRead: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

export default function Tutor() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [busy, setBusy] = useState(false);

  // auth (dev passwordless): register/login by email → JWT stored locally.
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem("neet_token"));
    setEmail(localStorage.getItem("neet_email") ?? "");
  }, []);

  async function signIn() {
    if (!email.trim()) return;
    const res = await fetch(`${AUTH_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem("neet_token", data.token);
      localStorage.setItem("neet_email", email);
      setToken(data.token);
    }
  }

  function signOut() {
    localStorage.removeItem("neet_token");
    setToken(null);
  }

  async function ask() {
    if (!question.trim() || busy) return;
    setBusy(true);
    setAnswer("");
    setMeta(null);

    const res = await fetch(`${AI_URL}/api/v1/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ question }),
    });

    if (!res.body) {
      setAnswer("No response stream.");
      setBusy(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const payload = line.replace(/^data: /, "").trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === "delta") setAnswer((a) => a + evt.text);
          else if (evt.type === "done") setMeta(evt.meta);
          else if (evt.type === "error") setAnswer((a) => a + `\n[error: ${evt.message}]`);
        } catch {
          /* ignore partial */
        }
      }
    }
    setBusy(false);
  }

  return (
    <main className="container">
      <Link href="/" className="meta">
        ← Dashboard
      </Link>
      <h2 className="brand" style={{ marginTop: 8 }}>
        AI Tutor
      </h2>

      <div className="meta" style={{ marginBottom: 12 }}>
        {token ? (
          <>
            <span className="tag">signed in: {email}</span>{" "}
            <a onClick={signOut} style={{ cursor: "pointer" }}>
              sign out
            </a>{" "}
            — your conversations are saved to your account.
          </>
        ) : (
          <span className="row" style={{ marginTop: 0 }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email to save your chats (dev sign-in)"
            />
            <button className="btn" onClick={signIn}>
              Sign in
            </button>
          </span>
        )}
      </div>

      <div className="chat">
        {answer || (
          <span style={{ color: "var(--muted)" }}>
            Ask a NEET question — e.g. &quot;Explain the photoelectric effect&quot; or
            &quot;Balance: KMnO4 + HCl&quot;. The answer streams in token by token.
          </span>
        )}
      </div>

      {meta && (
        <div className="meta">
          <span className="tag">{meta.provider}</span>{" "}
          <span className="tag">{meta.model}</span>{" "}
          <span className="tag">{meta.latencyMs} ms</span>{" "}
          {meta.cacheRead > 0 && <span className="tag">cache {meta.cacheRead} tok</span>}{" "}
          {meta.fallbackUsed && <span className="tag">fallback</span>}
        </div>
      )}

      <div className="row">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Ask a NEET question…"
        />
        <button className="btn" onClick={ask} disabled={busy}>
          {busy ? "Thinking…" : "Ask"}
        </button>
      </div>
    </main>
  );
}
