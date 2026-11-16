import { useState, useRef, useEffect } from 'react';
import { useCockpitData } from '../../api/CockpitData';
import { bff, type Analytics } from '../../api/bff';
import { WaveLine } from '../../components/WaveLine';

const VITALS = [
  { key: 'hr',   label: 'Heart rate', unit: 'bpm',  warnLine: 100, icon: '♥' },
  { key: 'spo2', label: 'SpO₂',       unit: '%',    warnLine: 95,  icon: '◎' },
  { key: 'eda',  label: 'EDA',        unit: 'µS',   warnLine: 5,   icon: '⚡' },
  { key: 'hrv',  label: 'HRV',        unit: 'ms',   warnLine: 30,  icon: '〜' },
  { key: 'sleep',label: 'Sleep',      unit: 'h',    warnLine: 6,   icon: '◑' },
];

const RANGES = ['24h', '7d', '30d'] as const;
type Range = typeof RANGES[number];

// Stored history (solid bars) followed by the 7-step GRU fusion forecast (hatched bars).
function toBars(data: Analytics | null): { value: number; forecast: boolean }[] {
  if (!data) return [];
  return [
    ...data.historical.map((h) => ({ value: h.value, forecast: false })),
    ...data.forecast_7step.map((value) => ({ value, forecast: true })),
  ];
}

interface Props {
  activeCrew?: string;
  theme?: 'dark' | 'light';
}

export function AnalyticsView({ activeCrew = 'okafor', theme = 'dark' }: Props) {
  const [selectedVital, setSelectedVital] = useState('hr');
  const [range, setRange] = useState<Range>('24h');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { crew: CREW } = useCockpitData();
  const [data, setData] = useState<Analytics | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const crew = CREW.find((c) => c.id === activeCrew) ?? CREW[0];
  const crewUpdatedAt = crew?.updatedAt;
  const vitalMeta = VITALS.find((v) => v.key === selectedVital) ?? VITALS[0];

  // Re-fetch on selection change and whenever a new reading for this crew member lands.
  useEffect(() => {
    let active = true;
    bff
      .analytics(activeCrew, selectedVital, range)
      .then((d) => active && (setData(d), setLoadError(null)))
      .catch((e: Error) => active && (setData(null), setLoadError(e.message)));
    return () => {
      active = false;
    };
  }, [activeCrew, selectedVital, range, crewUpdatedAt]);

  const bars = toBars(data);
  const forecBars = bars.filter((b) => b.forecast);

  const allValues = bars.map((b) => b.value);
  const minVal = allValues.length ? Math.min(...allValues) : 0;
  const maxVal = allValues.length ? Math.max(...allValues) : 0;
  const meanVal = data?.mean ?? (allValues.length ? allValues.reduce((a, b) => a + b, 0) / allValues.length : 0);
  const forecastEnd = data?.forecast_end ?? forecBars[forecBars.length - 1]?.value ?? 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function render() {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 20, bottom: 32, left: 8, right: 8 };
    const chartH = h - pad.top - pad.bottom;
    const chartW = w - pad.left - pad.right;
    const count = bars.length;
    const barW = Math.max(4, (chartW / count) - 2);
    const gap = (chartW - barW * count) / (count + 1);
    const rangeVal = maxVal - minVal || 1;

    function barX(i: number) {
      return pad.left + gap + i * (barW + gap);
    }
    function barY(val: number) {
      return pad.top + chartH - ((val - minVal) / rangeVal) * chartH * 0.9;
    }
    function barH(val: number) {
      return ((val - minVal) / rangeVal) * chartH * 0.9;
    }

    ctx.clearRect(0, 0, w, h);

    const isLight = theme === 'light';

    // Gridlines
    ctx.strokeStyle = isLight ? 'rgba(100, 116, 139, 0.15)' : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let gi = 0; gi <= 4; gi++) {
      const y = pad.top + (chartH / 4) * gi;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }

    // Warning line
    const warnY = barY(vitalMeta.warnLine);
    if (warnY > pad.top && warnY < h - pad.bottom) {
      ctx.strokeStyle = 'rgba(245,185,74,0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, warnY);
      ctx.lineTo(w - pad.right, warnY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(245,185,74,0.8)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${vitalMeta.warnLine} ${vitalMeta.unit}`, w - pad.right - 2, warnY - 4);
    }

    // Forecast divider
    const dividerIdx = bars.findIndex((b) => b.forecast);
    if (dividerIdx > 0) {
      const divX = barX(dividerIdx) - gap / 2;
      ctx.strokeStyle = isLight ? 'rgba(28, 79, 215, 0.35)' : 'rgba(191,211,242,0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(divX, pad.top);
      ctx.lineTo(divX, h - pad.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = isLight ? '#334155' : '#FFFFFF';
      ctx.font = '9px Manrope, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('FORECAST', divX + 4, pad.top + 10);
    }

    // Bars
    bars.forEach((bar, i) => {
      const x = barX(i);
      const bh = barH(bar.value);
      const y = pad.top + chartH - bh;
      const aboveWarn = bar.value > vitalMeta.warnLine;

      if (bar.forecast) {
        // Hatched forecast bar
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, barW, bh, [3, 3, 0, 0]);
        ctx.clip();

        // hatch fill
        ctx.strokeStyle = aboveWarn
          ? (isLight ? 'rgba(217,119,6,0.85)' : 'rgba(245,185,74,0.65)')
          : (isLight ? 'rgba(56,189,248,0.75)' : 'rgba(191,211,242,0.55)');
        ctx.lineWidth = 1.5;
        const hatchStep = 5;
        for (let hx = -bh; hx < barW + bh; hx += hatchStep) {
          ctx.beginPath();
          ctx.moveTo(x + hx, y + bh);
          ctx.lineTo(x + hx + bh, y);
          ctx.stroke();
        }
        ctx.restore();

        // Outline
        ctx.strokeStyle = aboveWarn
          ? (isLight ? 'rgba(217,119,6,0.95)' : 'rgba(245,185,74,0.8)')
          : (isLight ? 'rgba(20,52,147,0.90)' : 'rgba(191,211,242,0.6)');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, bh, [3, 3, 0, 0]);
        ctx.stroke();
      } else {
        // Solid historical bar (zero gradient)
        if (aboveWarn) {
          ctx.fillStyle = isLight ? '#D97706' : '#F5B94A';
        } else {
          ctx.fillStyle = isLight ? '#143493' : '#BFD3F2';
        }
        ctx.beginPath();
        ctx.roundRect(x, y, barW, bh, [3, 3, 0, 0]);
        ctx.fill();
      }
    });

    // Axis labels
    ctx.fillStyle = isLight ? '#64748B' : '#FFFFFF';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(count / 6));
    bars.forEach((_, i) => {
      if (i % step === 0) {
        const x = barX(i) + barW / 2;
        const label = range === '24h'
          ? `${i}h`
          : range === '7d'
          ? `D${i + 1}`
          : `D${i + 1}`;
        ctx.fillText(label, x, h - 8);
      }
    });
    }
    render();
    window.addEventListener('resize', render);
    return () => window.removeEventListener('resize', render);
  }, [activeCrew, selectedVital, range, theme, data]);

  return (
    <div className="view-enter" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 5 vital selector tiles */}
      <div className="analytics-vitals-row">
        {VITALS.map((v) => {
          const cur = data?.current;
          const val: Record<string, number | string> = {
            hr:    cur?.hr ?? crew?.hr ?? '—',
            spo2:  cur?.spo2 ?? crew?.spo2 ?? '—',
            eda:   cur?.eda ?? crew?.eda ?? '—',
            hrv:   cur?.hrv ?? crew?.hrv ?? '—',
            sleep: cur?.sleep ?? crew?.sleep ?? '—',
          };
          const isSelected = selectedVital === v.key;
          return (
            <button
              key={v.key}
              id={`vital-tile-${v.key}`}
              className={`tile vital-tile tile--ok${isSelected ? ' tile--selected' : ''}`}
              onClick={() => setSelectedVital(v.key)}
              style={{
                cursor: 'pointer',
                textAlign: 'left',
                minHeight: 116,
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              {/* Blurry ambient inner wave glow matching crew cards */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: -15,
                right: -15,
                height: 85,
                zIndex: 0,
                opacity: 0.75,
                pointerEvents: 'none',
                filter: 'blur(16px)',
                overflow: 'hidden',
              }}>
                <WaveLine
                  variant={['gentle','arc','flat','sharp','gentle'][VITALS.indexOf(v)] as any}
                  height={85}
                  status="nominal"
                  showBorder={false}
                  blur={16}
                />
              </div>
              <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', gap: 14 }}>
                <span className="label" style={{ color: 'var(--text-2)', fontWeight: 600, fontSize: 11, letterSpacing: '0.08em' }}>
                  {v.icon} {v.label}
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                  <span className="value-l" style={{ fontSize: 34, lineHeight: '38px', fontWeight: 600 }}>
                    {String(val[v.key])}
                  </span>
                  <span className="unit" style={{ color: '#94A3B8', fontWeight: 400, fontSize: 12, marginLeft: 4 }}>
                    {v.unit}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main chart tile */}
      <div className="tile chart-tile">
        <div className="chart-header">
          <div>
            <span className="view-title" style={{ fontSize: 18, fontWeight: 600 }}>{vitalMeta.label}</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 8 }}>· {crew?.name ?? '—'}</span>
          </div>
          <div className="range-tabs">
            {RANGES.map((r) => (
              <button
                key={r}
                id={`range-tab-${r}`}
                className={`range-tab${range === r ? ' range-tab--active' : ''}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="chart-area">
          <canvas ref={canvasRef} className="chart-canvas" style={{ width: '100%', height: '100%' }} />
        </div>

        <div className="chart-stats">
          {[
            { label: 'MIN',          value: minVal.toFixed(1),      unit: vitalMeta.unit },
            { label: 'MEAN',         value: meanVal.toFixed(1),     unit: vitalMeta.unit },
            { label: 'MAX',          value: maxVal.toFixed(1),      unit: vitalMeta.unit },
            { label: 'FORECAST END', value: forecastEnd.toFixed(1), unit: vitalMeta.unit },
          ].map((s) => (
            <div key={s.label} className="chart-stat">
              <span className="label" style={{ fontWeight: 500, color: 'var(--text-3)' }}>{s.label}</span>
              <span className="mono" style={{ color: 'var(--text-1)', fontSize: 16, fontWeight: 600 }}>
                {s.value} <span style={{ color: '#94A3B8', fontSize: 11, fontWeight: 400 }}>{s.unit}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="caption" style={{ marginTop: 12, color: 'var(--text-3)', fontWeight: 400 }}>
          {loadError ? `Analytics unavailable: ${loadError}` : 'Hatched bars are the 7-step GRU Fusion forecast.'}
        </div>
      </div>
    </div>
  );
}
