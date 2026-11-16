import { CREW } from '../data/crew';
import type { CrewStore } from '../lib/store';
import type { CrewId } from '../types';

interface Props {
  crews: CrewStore;
  active: CrewId;
  onSelect: (id: CrewId) => void;
}

/** One card per crew member. Shows the per-crew state Pulse keeps (keyed by crew_id). */
export function CrewRail({ crews, active, onSelect }: Props) {
  return (
    <nav className="rail" aria-label="Crew members">
      {CREW.map((c) => {
        const s = crews[c.id];
        return (
          <button key={c.id} className={c.id === active ? 'crew crew--on' : 'crew'} onClick={() => onSelect(c.id)} aria-pressed={c.id === active}>
            <span className="crew__top">
              <b>{c.name}</b>
              <span className={`tag tag--${s.status}`}>{s.status}</span>
            </span>
            <span className="crew__vals">
              <span><b>{s.vitals.hr}</b><small>bpm</small></span>
              <span><b>{s.vitals.spo2}</b><small>% SpO₂</small></span>
              <span><b>{s.vitals.eda.toFixed(1)}</b><small>µS</small></span>
            </span>
            <span className="crew__sync">
              {s.syncedAt ? `${s.source === 'model' ? 'Model' : 'Local'} · synced ${s.syncedAt}` : 'Not synced yet'}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
