'use client';
import { useEffect, useState } from 'react';
import { getDrift } from '@/lib/api';
import { DRIFT_COLORS } from '@/lib/colors';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface DriftData {
  trustState: string;
  rollingError: { window: string; pm25_mae: number; no2_mae: number };
  psi: Array<{ feature: string; value: number; status: string }>;
}

const PSI_COLORS: Record<string, string> = { STABLE: '#00882b', MODERATE: '#e8a000', HIGH: '#cc1a1a' };

export function DriftPanel() {
  const [drift, setDrift] = useState<DriftData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const d = await getDrift('Netherlands');
      setDrift(d);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); const id = setInterval(refresh, 30_000); return () => clearInterval(id); }, []);

  if (loading) return <div className="panel"><p className="loading">Loading drift data...</p></div>;
  if (!drift) return <div className="panel"><p className="loading">Drift service unavailable</p></div>;

  const dotColor = DRIFT_COLORS[drift.trustState] ?? '#888';

  return (
    <div className="panel">
      <p className="panel-title">Trust & Drift Monitor</p>

      <div className="drift-pill" style={{ background: dotColor + '22', color: dotColor, border: `1px solid ${dotColor}55` }}>
        <span className="drift-dot" style={{ background: dotColor }} />
        {drift.trustState}
      </div>

      <div style={{ marginTop: 12, marginBottom: 8 }}>
        <div className="metric-row">
          <span className="metric-label">PM2.5 MAE ({drift.rollingError.window})</span>
          <span className="metric-value">{drift.rollingError.pm25_mae.toFixed(2)} µg/m³</span>
        </div>
        <div className="metric-row">
          <span className="metric-label">NO₂ MAE ({drift.rollingError.window})</span>
          <span className="metric-value">{drift.rollingError.no2_mae.toFixed(2)} µg/m³</span>
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>PSI Drift by Feature</p>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={drift.psi} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <XAxis dataKey="feature" tick={{ fontSize: 10, fill: '#9ca3af' }} />
          <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} domain={[0, 0.4]} />
          <Tooltip
            contentStyle={{ background: '#1f2937', border: '1px solid #374151', fontSize: 11 }}
            formatter={(v: number) => [v.toFixed(3), 'PSI']}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {drift.psi.map((entry, i) => (
              <Cell key={i} fill={PSI_COLORS[entry.status] ?? '#888'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
