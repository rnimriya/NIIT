"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const NOTIFICATIONS_URL =
  process.env.NEXT_PUBLIC_NOTIFICATIONS_URL ?? "http://localhost:4007";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export default function NotificationsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const t = localStorage.getItem("neet_token");
    setToken(t);
    if (t) load(t);
  }, []);

  function load(t: string) {
    fetch(`${NOTIFICATIONS_URL}/api/v1/notifications`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && (setItems(d.items), setUnread(d.unread)))
      .catch(() => {});
  }

  async function markAll() {
    if (!token) return;
    await fetch(`${NOTIFICATIONS_URL}/api/v1/notifications/read-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    load(token);
  }

  return (
    <main className="container">
      <Link href="/" className="meta">
        ← Dashboard
      </Link>
      <h2 className="brand" style={{ marginTop: 8 }}>
        Notifications {unread > 0 && <span className="tag">{unread} new</span>}
      </h2>

      {!token && <p className="meta">Sign in on the Tutor page to see your notifications.</p>}

      {token && items.length === 0 && (
        <p className="meta">
          Nothing yet — take a diagnostic or generate a plan and they&apos;ll show up here.
        </p>
      )}

      {unread > 0 && (
        <button className="btn" onClick={markAll} style={{ marginBottom: 12 }}>
          Mark all read
        </button>
      )}

      {items.map((n) => (
        <div
          className="card"
          key={n.id}
          style={{ marginBottom: 10, opacity: n.readAt ? 0.6 : 1 }}
        >
          <h3>
            {!n.readAt && <span className="tag">new</span>} {n.title}
          </h3>
          <div>{n.body}</div>
          <div className="meta" style={{ marginTop: 6 }}>
            {new Date(n.createdAt).toLocaleString()} · {n.type}
          </div>
        </div>
      ))}
    </main>
  );
}
