'use client';
import { useState } from 'react';
import { runScenario, validatePayload } from '@/lib/api';
import { TierBadge } from './TierBadge';

interface ScenarioResult {
  requestId: string;
  baseline: { derived: { crs: number; tier: string; actionAllowed: boolean }; pollutants: Record<string, { predicted: number; psi: number }> };
  scenario: { derived: { crs: number; tier: string; actionAllowed: boolean }; pollutants: Record<string, { predicted: number; psi: number }> };
}

export function ScenarioPanel({
  selectedCellId,
  viewMode,
}: {
  selectedCellId?: string;
  viewMode?: 'netherlands' | 'world';
}) {
  const [trafficMul, setTrafficMul] = useState(1.0);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [validatedId, setValidatedId] = useState<string | null>(null);

  const cellId = selectedCellId ?? 'FAKE_H3_52.3_4.9_r6';
  const isWorldMode = viewMode === 'world';

  const run = async () => {
    setLoading(true);
    try {
      const r = await runScenario({
        region: 'Netherlands',
        timeUtc: new Date().toISOString(),
        cellId,
        levers: { trafficMultiplier: trafficMul, zone: 'A10-ring' },
      });
      setResult(r);
      if (r.scenario) {
        const validated = await validatePayload(r.scenario);
        if (validated?.requestId) setValidatedId(validated.requestId);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel">
      <p className="panel-title">Scenario Simulator</p>

      {/* Selected cell indicator */}
      {selectedCellId && (
        <div style={{ marginBottom: 10, padding: '5px 8px', background: 'var(--surface3)', borderRadius: 4, fontSize: 11 }}>
          <span style={{ color: 'var(--text-muted)' }}>Selected cell: </span>
          <span className="tag" style={{ wordBreak: 'break-all' }}>{selectedCellId.slice(0, 24)}{selectedCellId.length > 24 ? '…' : ''}</span>
        </div>
      )}

      {isWorldMode ? (
        <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <p>🌍 Scenario simulation runs on the <strong style={{ color: 'var(--text)' }}>Netherlands validated twin</strong>.</p>
          <br />
          <p>Switch to <strong style={{ color: 'var(--text)' }}>🇳🇱 NL view</strong>, click a cell on the map, then adjust the traffic lever to simulate its impact.</p>
        </div>
      ) : (
        <>
          <div className="slider-wrap">
            <label>Traffic Multiplier (A10-ring)</label>
            <input
              type="range" min={0.5} max={1.2} step={0.05}
              value={trafficMul}
              onChange={(e) => setTrafficMul(parseFloat(e.target.value))}
            />
            <div className="slider-val">
              {trafficMul < 1.0
                ? `Traffic −${Math.round((1 - trafficMul) * 100)}%`
                : trafficMul > 1.0
                ? `Traffic +${Math.round((trafficMul - 1) * 100)}%`
                : 'Baseline'}
            </div>
          </div>

          <button className="btn btn-primary" style={{ marginTop: 10, width: '100%' }} onClick={run} disabled={loading}>
            {loading ? 'Running...' : 'Run Scenario'}
          </button>

          {result && (
            <div className="scenario-compare">
              <div className="scenario-col">
                <h5>Baseline</h5>
                <TierBadge tier={result.baseline.derived.tier} />
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  <div>CRS: <strong>{result.baseline.derived.crs.toFixed(1)}</strong></div>
                  {Object.entries(result.baseline.pollutants).map(([k, v]) => (
                    <div key={k}>{k.toUpperCase()}: {v.predicted.toFixed(1)}</div>
                  ))}
                </div>
              </div>
              <div className="scenario-col">
                <h5>Scenario</h5>
                <TierBadge tier={result.scenario.derived.tier} />
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  <div>CRS: <strong>{result.scenario.derived.crs.toFixed(1)}</strong>
                    {result.scenario.derived.crs < result.baseline.derived.crs && (
                      <span style={{ color: 'var(--green)', marginLeft: 4 }}>▼ {(result.baseline.derived.crs - result.scenario.derived.crs).toFixed(1)}</span>
                    )}
                    {result.scenario.derived.crs > result.baseline.derived.crs && (
                      <span style={{ color: 'var(--red)', marginLeft: 4 }}>▲ {(result.scenario.derived.crs - result.baseline.derived.crs).toFixed(1)}</span>
                    )}
                  </div>
                  {Object.entries(result.scenario.pollutants).map(([k, v]) => {
                    const base = result.baseline.pollutants[k]?.predicted ?? 0;
                    const delta = v.predicted - base;
                    return (
                      <div key={k}>
                        {k.toUpperCase()}: {v.predicted.toFixed(1)}
                        {delta !== 0 && (
                          <span style={{ marginLeft: 4, color: delta < 0 ? 'var(--green)' : 'var(--red)', fontSize: 10 }}>
                            {delta < 0 ? '▼' : '▲'}{Math.abs(delta).toFixed(1)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {validatedId && (
            <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              Validated: <span className="tag">{validatedId.slice(0, 20)}…</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
