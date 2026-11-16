import { API_BASE } from '../config';
import type { CrewId, PulseTelemetryRequest, PulseTelemetryResponse } from '../types';

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* body was not JSON */
    }
    throw new Error(`HTTP ${res.status} ${detail}`.trim());
  }
  return res.json() as Promise<T>;
}

export const pulseApi = {
  /** Lights the green "Offline · on-board models" badge when models_loaded is true. */
  health: async () =>
    parse<{ status: string; models_loaded?: boolean }>(await fetch(`${API_BASE}/api/v1/health`)),

  ingest: async (payload: PulseTelemetryRequest) =>
    parse<PulseTelemetryResponse>(
      await fetch(`${API_BASE}/api/v1/pulse/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    ),

  /** Latest stored reading + model output for a crew member (hydrates the watch on load). */
  state: async (crewId: CrewId) =>
    parse<PulseTelemetryResponse & {
      recorded_at: string | null;
      vitals_current: { hr_bpm: number; spo2_pct: number; eda_us: number | null } | null;
    }>(await fetch(`${API_BASE}/api/v1/pulse/crew/${crewId}/state`)),

  /** Symptom logged on the watch; stored as a log entry the Cockpit Alerts feed shows. */
  logSymptom: async (crewId: CrewId, label: string) =>
    parse<unknown>(
      await fetch(`${API_BASE}/api/v1/pulse/crew/${crewId}/symptoms`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label }),
      }),
    ),
};
