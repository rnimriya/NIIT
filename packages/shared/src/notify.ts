export interface NotifyPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  channel?: "in_app" | "email" | "push";
  dedupeWindowSec?: number;
}

/**
 * Fire-and-forget notification emit. Best-effort: a notifications outage must
 * never break the calling request. This is the HTTP stand-in for what becomes a
 * Kafka event publish once the event bus lands.
 */
export async function emitNotification(
  baseUrl: string,
  payload: NotifyPayload,
): Promise<void> {
  try {
    await fetch(`${baseUrl}/api/v1/notifications/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* swallow — notifications are non-critical to the calling flow */
  }
}
