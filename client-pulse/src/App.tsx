import { useCallback, useEffect, useMemo, useState } from 'react';
import { pulseApi } from './api/pulse';
import { COCKPIT_URL, HEALTH_POLL_MS } from './config';
import { CREW, crewName } from './data/crew';
import { buildPayload, localStatus, statusFromAnomaly } from './lib/payload';
import { initialStore, NOMINAL_VITALS, type CrewState, type CrewStore } from './lib/store';
import { publish, subscribe } from './lib/sync';
import { CrewRail } from './components/CrewRail';
import { SCREENS, Watch } from './components/Watch';
import { TelemetryDrawer } from './components/TelemetryDrawer';
import type { CrewId, SimEvent, Telemetry } from './types';

const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [crews, setCrews] = useState<CrewStore>(initialStore); // global state, organised by crew_id
  const [active, setActive] = useState<CrewId>('okafor');
  const [screen, setScreen] = useState(0);
  const [time, setTime] = useState(clock());
  const [drawer, setDrawer] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [acked, setAcked] = useState(false);

  const cs = crews[active];
  const payload = useMemo(() => buildPayload(cs.form), [cs.form]);

  const update = useCallback(
    (id: CrewId, fn: (s: CrewState) => CrewState) => setCrews((c) => ({ ...c, [id]: fn(c[id]) })),
    [],
  );

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { const id = setInterval(() => setTime(clock()), 15_000); return () => clearInterval(id); }, []);

  // Green "Offline · on-board models" badge: only while GET /api/v1/health passes.
  useEffect(() => {
    let live = true;
    const check = () =>
      pulseApi.health()
        .then((h) => live && setModelsLoaded(h.models_loaded === true || h.status === 'online'))
        .catch(() => live && setModelsLoaded(false));
    check();
    const id = setInterval(check, HEALTH_POLL_MS);
    return () => { live = false; clearInterval(id); };
  }, []);

  // Hydrate every crew member's watch from the last stored reading + model output.
  useEffect(() => {
    let live = true;
    for (const { id } of CREW) {
      pulseApi.state(id).then((s) => {
        if (!live || !s.vitals_current) return;
        const v = s.vitals_current;
        update(id, (cs) => ({
          ...cs,
          vitals: { hr: Math.round(v.hr_bpm), spo2: Math.round(v.spo2_pct), eda: v.eda_us ?? cs.vitals.eda },
          status: s.crew_status_badge ?? statusFromAnomaly(s.fusion_outputs?.anomaly_score) ?? cs.status,
          hrHistory: s.hr_24h_bars?.length ? s.hr_24h_bars.slice(-24) : cs.hrHistory,
          response: s,
          source: 'model',
          syncedAt: s.recorded_at ? new Date(s.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : cs.syncedAt,
        }));
      }).catch(() => { /* backend offline: keep defaults until the first sync */ });
    }
    return () => { live = false; };
  }, [update]);

  // Cockpit -> Pulse: acknowledging an alert updates the watch.
  useEffect(() => subscribe((m) => {
    if (m.type === 'ack') { setAcked(true); setTimeout(() => setAcked(false), 6000); }
  }), []);

  const setForm = (form: Telemetry) => update(active, (s) => ({ ...s, form }));

  const simulate = (e: SimEvent) => {
    update(active, (s) => {
      if (e === 'spo2') return { ...s, simEvent: e, vitals: { ...NOMINAL_VITALS, spo2: 91 }, status: 'Warning', statusNote: 'SpO₂ low' };
      if (e === 'critical') return { ...s, simEvent: e, vitals: { hr: 148, spo2: 96, eda: 4.6 }, status: 'Critical', statusNote: 'Irregular rhythm' };
      return { ...s, simEvent: null, vitals: { ...NOMINAL_VITALS }, status: 'Nominal', statusNote: undefined };
    });
    publish({ type: 'event', crew_id: active, name: e ?? 'reset' });
  };

  const logSymptom = (label: string) => {
    const at = clock();
    update(active, (s) => ({ ...s, symptoms: [{ id: Date.now(), label, at }, ...s.symptoms] }));
    publish({ type: 'symptom', crew_id: active, label, at });
    pulseApi.logSymptom(active, label).catch(() => { /* offline: the watch keeps the local entry */ });
  };

  const toggleTask = (taskId: string) => {
    const done = !cs.tasks.find((t) => t.id === taskId)?.done;
    update(active, (s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, done } : t)) }));
    publish({ type: 'task', crew_id: active, task_id: taskId, done });
  };

  const sync = async () => {
    const id = active;
    const f = cs.form;
    const req = payload;
    setSyncing(true);
    update(id, (s) => ({
      ...s,
      simEvent: null,
      error: null,
      vitals: { hr: f.hr_bpm, spo2: f.spo2_pct, eda: f.eda_tonic_us },
      hrHistory: [...s.hrHistory.slice(1), f.hr_bpm],
    }));
    publish({ type: 'telemetry', crew_id: id, request: req });
    try {
      const res = await pulseApi.ingest(req);
      update(id, (s) => ({
        ...s,
        response: res,
        error: null,
        source: 'model',
        syncedAt: clock(),
        statusNote: undefined,
        status: res.crew_status_badge ?? statusFromAnomaly(res.fusion_outputs?.anomaly_score) ?? localStatus(f.hr_bpm, f.spo2_pct),
        hrHistory: res.hr_24h_bars?.length ? res.hr_24h_bars.slice(-24) : s.hrHistory,
      }));
      publish({ type: 'state', crew_id: id, request: req, response: res });
    } catch (e) {
      update(id, (s) => ({
        ...s,
        response: null,
        error: e instanceof Error ? e.message : String(e),
        source: 'local',
        syncedAt: clock(),
        status: localStatus(f.hr_bpm, f.spo2_pct),
        statusNote: 'Local estimate',
      }));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>A.V.I.A. Pulse</h1>
          <p className="muted">Edge interface · Smartwatch · worn by {crewName(active)}</p>
        </div>
        <span className="spacer" />
        <span className={modelsLoaded ? 'pill pill--ok' : 'pill'} title="GET /api/v1/health">
          <i /> {modelsLoaded ? 'Offline · on-board models' : 'Backend offline'}
        </span>
        <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle light or dark theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <a className="link" href={COCKPIT_URL} target="_blank" rel="noreferrer">Open A.V.I.A. Cockpit ↗</a>
      </header>

      <CrewRail crews={crews} active={active} onSelect={setActive} />

      <main className="main">
        <div>
          <Watch
            screen={screen}
            time={time}
            status={cs.status}
            statusNote={cs.statusNote}
            vitals={cs.vitals}
            hrHistory={cs.hrHistory}
            symptoms={cs.symptoms}
            tasks={cs.tasks}
            onLogSymptom={logSymptom}
            onToggleTask={toggleTask}
            onPrev={() => setScreen((s) => (s + SCREENS.length - 1) % SCREENS.length)}
            onNext={() => setScreen((s) => (s + 1) % SCREENS.length)}
          />
          <p className="caption">{screen + 1} / {SCREENS.length} · {SCREENS[screen]}</p>
          {acked && <p className="banner" role="status">Alert acknowledged in Cockpit</p>}
        </div>

        <aside className="panel">
          <h3>Screens</h3>
          <div className="grid2">
            {SCREENS.map((s, i) => (
              <button key={s} className={i === screen ? 'btn btn--on' : 'btn'} onClick={() => setScreen(i)}>{s}</button>
            ))}
          </div>

          <h3>Simulate an event on the watch</h3>
          <button className={cs.simEvent === 'spo2' ? 'btn btn--on btn--block' : 'btn btn--block'} onClick={() => simulate('spo2')}>SpO₂ warning</button>
          <button className={cs.simEvent === 'critical' ? 'btn btn--on btn--block' : 'btn btn--block'} onClick={() => simulate('critical')}>Critical: irregular rhythm</button>
          <button className="textbtn" onClick={() => simulate(null)}>Reset to nominal</button>

          <h3>Send readings to the backend</h3>
          <button className="btn btn--primary btn--block" onClick={() => setDrawer(true)}>Open telemetry input</button>

          <p className="muted small">
            Events, symptom logs and task check-offs sync to the Cockpit page. Open both side by side: acknowledging an alert in the Cockpit updates this watch.
          </p>
        </aside>
      </main>

      <TelemetryDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        crewId={active}
        onCrewChange={setActive}
        form={cs.form}
        setForm={setForm}
        payload={payload}
        syncing={syncing}
        onSync={sync}
        result={cs.response}
        error={cs.error}
      />
    </div>
  );
}
