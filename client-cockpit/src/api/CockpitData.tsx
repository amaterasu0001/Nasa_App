import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { bff, type AlertItem, type CrewMember, type Mission } from './bff';
import { POLL_INTERVAL_MS } from '../config';

interface CockpitData {
  crew: CrewMember[];
  alerts: AlertItem[];
  mission: Mission | null;
  error: string | null;
  loaded: boolean;
  /** Re-fetch now (after a submission), instead of waiting for the next poll. */
  refresh: () => Promise<void>;
}

const Ctx = createContext<CockpitData>({
  crew: [],
  alerts: [],
  mission: null,
  error: null,
  loaded: false,
  refresh: async () => {},
});

/** Polls the BFF for the crew roster, alert feed and mission once, for every view. */
export function CockpitDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<CockpitData, 'refresh'>>({
    crew: [],
    alerts: [],
    mission: null,
    error: null,
    loaded: false,
  });

  const refresh = useCallback(async () => {
    try {
      const [crew, alerts, mission] = await Promise.all([bff.crew(), bff.alerts(), bff.mission()]);
      setState({ crew, alerts, mission, error: null, loaded: true });
    } catch (e) {
      setState((s) => ({ ...s, error: (e as Error).message, loaded: true }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>;
}

export const useCockpitData = () => useContext(Ctx);
