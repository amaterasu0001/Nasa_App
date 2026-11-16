import type { Status } from '../lib/status';

/** Crew card, as shaped by the BFF (GET /cockpit/crew) from the latest model inference. */
export interface CrewMember {
  id: string;
  initials: string;
  name: string;
  role: string;
  status: Status;
  hr: number | null;
  spo2: number | null;
  eda: number | null;
  hrv: number | null;
  sleep: number | null;
  hrHistory: number[]; // 24 hourly values for the bar chart
  flags: string[];
  openAlerts: number;
  strainMarkers: { Sleep: number; Workload: number };
  updatedAt: string | null;
}

export interface AlertItem {
  id: string;
  crewId: string;
  crewName: string;
  kind: string;
  source: string;
  title: string;
  detail: string;
  value: string;
  status: Status;
  time: string;
  modelDerived: boolean;
  isMock?: boolean;
  contributions: { label: string; pct: number }[];
  explanation: string;
}

export interface Countermeasure {
  id: number;
  label: string;
  done: boolean;
  crew_id: string | null;
}

export interface Analytics {
  current: { hr: number; spo2: number; eda: number; hrv: number; sleep: number } | null;
  historical: { t: string; value: number }[];
  forecast_7step: number[];
  min: number | null;
  mean: number | null;
  max: number | null;
  forecast_end: number | null;
}

export interface TwinRegion {
  today_bmd: number;
  projected_bmd: number;
  rate_per_day: number;
  status_today: string;
  warning_in_days: number | null;
}

export interface Twin {
  heart_rate: number | null;
  skeletal_risk_projection: {
    warning_in_days: number | null;
    adherence_pct: number;
    regions: { femoral: TwinRegion; lumbar: TwinRegion };
  };
  cardiovascular: { status: 'Nominal' | 'Warning' | 'Critical' | null; cardiac_anomaly_prob: number | null };
}

export interface Mission {
  name: string;
  mission_day: number;
  phase: string;
  duration_days: number;
  orbit_altitude_km: number | null;
}

export type Baseline = Record<string, number>;

/** Inputs of POST /api/v1/suit/evaluate (agent SuitRequest). The core API adds the crew's base_hr / base_spo2. */
export interface SuitInput {
  suit_p_left_arm_psi: number;
  suit_p_right_arm_psi: number;
  suit_p_legs_psi: number;
  suit_p_torso_psi: number;
  bioimp_left_arm_ohm: number;
  bioimp_right_arm_ohm: number;
  bioimp_legs_ohm: number;
  hr_bpm: number;
  spo2_pct: number;
  resp_rate_bpm: number;
}

export type SuitTier = 'Nominal' | 'Warning' | 'Critical';

export interface SuitResult {
  crew_id: string;
  predicted_zone_id: number;
  predicted_zone_label: string;
  zone_confidence: number;
  depressurization_prob: number;
  swelling_pct_by_region: { left_forearm: number; right_forearm: number; lower_body_legs: number };
  digital_twin_body_map: {
    left_forearm: SuitTier;
    right_forearm: SuitTier;
    lower_body_femoral: SuitTier;
    torso_cardiopulmonary: SuitTier;
  };
  model_version: string;
}

/** Error thrown for non-2xx BFF responses; `message` carries the backend's explanation when it sent one. */
export class BffError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/bff${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const base = data?.error ?? data?.message ?? `BFF ${res.status}: ${path}`;
    throw new BffError(res.status, typeof data?.detail === 'string' ? `${base}: ${data.detail}` : base);
  }
  return data as T;
}

const get = <T>(path: string) => request<T>('GET', path);

export const bff = {
  crew: () => get<CrewMember[]>('/cockpit/crew'),
  alerts: () => get<AlertItem[]>('/cockpit/alerts'),
  analytics: (crewId: string, metric: string, range: string) =>
    get<Analytics>(`/cockpit/crew/${crewId}/analytics?metric=${metric}&window=${range}`),
  twin: (crewId: string, adherence: number) => get<Twin>(`/cockpit/crew/${crewId}/twin?adherence=${adherence}`),
  evaluateSuit: (crewId: string, input: SuitInput) =>
    request<SuitResult>('POST', '/api/v1/suit/evaluate', { crew_id: crewId, ...input }),
  submitVitals: (crewId: string, telemetry: Record<string, number>) =>
    request<unknown>('POST', `/cockpit/crew/${crewId}/telemetry`, telemetry),
  baseline: (crewId: string) => get<Baseline>(`/cockpit/crew/${crewId}/baseline`),
  saveBaseline: (crewId: string, patch: Baseline) => request<Baseline>('PUT', `/cockpit/crew/${crewId}/baseline`, patch),
  mission: () => get<Mission>('/cockpit/mission'),
  saveMission: (patch: Partial<Mission>) => request<Mission>('PUT', '/cockpit/mission', patch),
  countermeasures: () => get<Countermeasure[]>('/cockpit/countermeasures'),
  addCountermeasure: (label: string, crewId?: string) =>
    request<Countermeasure>('POST', '/cockpit/countermeasures', { label, crew_id: crewId, source: 'digital_twin' }),
  setCountermeasure: (id: number, done: boolean) => request<Countermeasure>('PATCH', `/cockpit/countermeasures/${id}`, { done }),
};
