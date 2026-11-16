import { useRef, useEffect } from 'react';
import { useCockpitData } from '../../api/CockpitData';

// Sleep and Workload are counted by the backend from model outputs (days this week with Sleep_z < -1.5 /
// stress_score > 0.60). Isolation has no model behind it and stays a static marker.
const ISOLATION_MARKER = { label: 'Isolation', count: 1 };

function SentimentChart({ theme = 'dark' }: { theme?: 'dark' | 'light' }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const isLight = theme === 'light';
    const canvas = ref.current;
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
    const points = [
      0.6, 0.55, 0.62, 0.58, 0.65, 0.7, 0.68, 0.6, 0.55, 0.52,
      0.48, 0.5, 0.54, 0.58, 0.6, 0.63, 0.65, 0.62, 0.6, 0.58,
    ];

    const pad = { left: 16, right: 16, top: 16, bottom: 16 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    function px(i: number, v: number) {
      return {
        x: pad.left + (i / (points.length - 1)) * cw,
        y: pad.top + ch - v * ch,
      };
    }

    // Solid area under line (zero gradient)
    ctx.beginPath();
    points.forEach((v, i) => {
      const p = px(i, v);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else {
        const prev = px(i - 1, points[i - 1]);
        const cx = (prev.x + p.x) / 2;
        ctx.bezierCurveTo(cx, prev.y, cx, p.y, p.x, p.y);
      }
    });
    const last = px(points.length - 1, points[points.length - 1]);
    ctx.lineTo(last.x, h - pad.bottom);
    ctx.lineTo(pad.left, h - pad.bottom);
    ctx.closePath();
    ctx.fillStyle = isLight ? 'rgba(20, 52, 147, 0.08)' : 'rgba(191, 211, 242, 0.08)';
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.filter = 'none';
    points.forEach((v, i) => {
      const p = px(i, v);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else {
        const prev = px(i - 1, points[i - 1]);
        const cx = (prev.x + p.x) / 2;
        ctx.bezierCurveTo(cx, prev.y, cx, p.y, p.x, p.y);
      }
    });
    ctx.strokeStyle = isLight ? '#143493' : '#BFD3F2';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.filter = 'none';
    }
    render();
    window.addEventListener('resize', render);
    return () => window.removeEventListener('resize', render);
  }, [theme]);

  return (
    <canvas
      ref={ref}
      style={{ width: '100%', height: '100%' }}
      aria-label="Sentiment chart"
    />
  );
}

export function BehavioralHealthView({ activeCrew = 'okafor', theme = 'dark' }: { activeCrew?: string; theme?: 'dark' | 'light' }) {
  const { crew: CREW } = useCockpitData();
  const markers = CREW.find((c) => c.id === activeCrew)?.strainMarkers;
  const STRAIN_MARKERS = [
    { label: 'Sleep', count: markers?.Sleep ?? 0 },
    { label: 'Workload', count: markers?.Workload ?? 0 },
    ISOLATION_MARKER,
  ];

  return (
    <div className="behavioral-layout view-enter">
      {/* Sentiment chart tile */}
      <div className="tile sentiment-tile">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span className="view-title" style={{ fontSize: 18, fontWeight: 600 }}>Behavioral Health</span>
          <span className="chip" style={{ fontWeight: 600 }}>Not model-derived</span>
        </div>
        <div style={{ height: 160 }}>
          <SentimentChart theme={theme} />
        </div>
        <div className="caption" style={{ marginTop: 8, color: 'var(--text-3)', fontWeight: 400 }}>
          Composite sentiment score · Mission days 130–142
        </div>
      </div>

      {/* Entry tiles */}
      <div className="entry-tiles">
        {CREW.map((member) => (
          <div key={member.id} className="tile entry-tile">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="crew-card__name" style={{ fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: 16 }}>
                {member.name}
              </span>
              <span className="entry-tile__lock">🔒</span>
            </div>
            <div className="label" style={{ color: 'var(--text-3)', fontWeight: 500 }}>{member.role}</div>
            <div style={{ marginTop: 8 }}>
              <div className="caption" style={{ color: 'var(--text-3)', fontStyle: 'italic', fontWeight: 400 }}>
                Journal text stays private to the crew member until consent is given.
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn-ghost" style={{ fontSize: 11 }}>Voice entry</button>
              <button className="btn-ghost" style={{ fontSize: 11 }}>Text entry</button>
            </div>
          </div>
        ))}
      </div>

      {/* Strain markers */}
      <div className="tile" style={{ padding: '16px 20px' }}>
        <div className="label" style={{ marginBottom: 12, fontWeight: 600, fontSize: 12, letterSpacing: '0.08em' }}>Strain markers</div>
        <div className="strain-pills">
          {STRAIN_MARKERS.map((s) => (
            <div key={s.label} className="strain-pill">
              <div className="status-dot status-dot--warn" />
              <span>{s.label}</span>
              <span className="strain-pill__count">{s.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
