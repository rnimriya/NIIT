import Link from "next/link";

export default function Dashboard() {
  return (
    <main className="container">
      <div className="brand">NEET Mock Test AI</div>
      <p style={{ color: "var(--muted)", marginTop: 4 }}>
        Your autonomous prep dashboard
      </p>

      <div className="grid">
        <div className="card">
          <h3>Predicted Score</h3>
          <div className="big">612</div>
          <div className="meta">Rank band 1500–3000 · 82% confidence</div>
        </div>
        <div className="card">
          <h3>Today&apos;s Focus</h3>
          <div className="big">3 concepts</div>
          <div className="meta">Thermodynamics · Mole Concept · Genetics</div>
        </div>
        <div className="card">
          <h3>Revisions Due</h3>
          <div className="big">7</div>
          <div className="meta">Spaced repetition queue</div>
        </div>
        <div className="card">
          <h3>Streak</h3>
          <div className="big">12 days</div>
          <div className="meta">Keep it going</div>
        </div>
      </div>

      <Link href="/tutor" className="btn">
        Ask the AI Tutor →
      </Link>{" "}
      <Link href="/test" className="btn">
        Take a Diagnostic →
      </Link>

      <p className="meta" style={{ marginTop: 28 }}>
        This is the vertical slice. Dashboard figures are illustrative; the AI
        Tutor is live and streams from the AI gateway (Claude, with fallback).
      </p>
    </main>
  );
}
