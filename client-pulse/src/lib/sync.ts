/**
 * Pulse <-> Cockpit message contract.
 *
 * Transport: Server-Sent Events relay served by Pulse's own Vite server (/__avia/stream, /__avia/publish),
 * because the two apps run on different ports and BroadcastChannel cannot cross origins.
 * BroadcastChannel is kept as a same-origin fallback (e.g. when both are embedded in one app).
 * Swap this file's transport for the real BFF/WebSocket later; the message shapes are the contract.
 */
export type SyncMessage =
  /** Raw reading that was just submitted. */
  | { type: 'telemetry'; crew_id: string; request: unknown }
  /** The backend's CockpitStateResponse for that crew member. Cockpit stores it by crew_id. */
  | { type: 'state'; crew_id: string; request: unknown; response: unknown }
  | { type: 'event'; crew_id: string; name: string }
  | { type: 'symptom'; crew_id: string; label: string; at: string }
  | { type: 'task'; crew_id: string; task_id: string; done: boolean }
  /** Cockpit -> Pulse */
  | { type: 'ack'; alert_id?: string };

const RELAY = '/__avia';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('avia-sync') : null;

export function publish(msg: SyncMessage) {
  channel?.postMessage(msg);
  fetch(`${RELAY}/publish`, { method: 'POST', body: JSON.stringify(msg) }).catch(() => {});
}

export function subscribe(fn: (msg: SyncMessage) => void) {
  const onChannel = (e: MessageEvent<SyncMessage>) => fn(e.data);
  channel?.addEventListener('message', onChannel);
  let es: EventSource | null = null;
  if (typeof EventSource !== 'undefined') {
    es = new EventSource(`${RELAY}/stream`);
    es.onmessage = (e) => {
      try { fn(JSON.parse(e.data) as SyncMessage); } catch { /* ignore malformed */ }
    };
  }
  return () => {
    channel?.removeEventListener('message', onChannel);
    es?.close();
  };
}
