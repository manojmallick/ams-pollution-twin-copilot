'use client';
import { useState } from 'react';
import { TierBadge } from './TierBadge';
import { exportAuditPdf, explain, validatePayload } from '@/lib/api';

interface CellData {
  cellId: string;
  region: string;
  timeUtc: string;
  derived: { crs: number; tier: string; actionAllowed: boolean; reasonCodes: string[] };
  pollutants: Record<string, { predicted: number; unit: string; psi: number; uncertaintyNorm: number; pi95: [number, number] }>;
  trust?: { sensorConfidence: number; overallConfidence: number; driftState: string };
  evidenceSources?: Array<{ sourceId: string; freshnessMinutes: number; license: string }>;
  requestId?: string;
}

const TIER_BG: Record<string, string> = {
  GREEN: 'rgba(0,136,43,0.15)',
  AMBER: 'rgba(232,160,0,0.15)',
  RED: 'rgba(204,26,26,0.15)',
  PURPLE: 'rgba(123,45,139,0.2)',
  DATA_GAP: 'rgba(100,100,100,0.15)',
};

const TIER_BORDER: Record<string, string> = {
  GREEN: '#00882b',
  AMBER: '#e8a000',
  RED: '#cc1a1a',
  PURPLE: '#7b2d8b',
  DATA_GAP: '#555',
};

export function CellTooltip({ cell, onClose }: { cell: CellData; onClose: () => void }) {
  const [narrative, setNarrative] = useState<string | null>(null);
  const [greenMeter, setGreenMeter] = useState<{ provider: string; tokensIn: number; tokensOut: number; energyWh: number; co2eGrams: number } | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [validatedId, setValidatedId] = useState(cell.requestId ?? null);
  const [explainStyle, setExplainStyle] = useState<'CITIZEN' | 'CITY_OPS'>('CITIZEN');

  const tierBg = TIER_BG[cell.derived.tier] ?? 'transparent';
  const tierBorder = TIER_BORDER[cell.derived.tier] ?? '#555';

  const ensureValidated = async () => {
    if (validatedId) return validatedId;
    const validated = await validatePayload(cell);
    const id = validated?.requestId ?? null;
    setValidatedId(id);
    return id;
  };

  const handleExplain = async () => {
    setExplaining(true);
    setNarrative(null);
    setGreenMeter(null);
    try {
      const id = await ensureValidated();
      if (!id) { setNarrative('Validation failed — cannot generate explanation.'); return; }
      const res = await explain(id, cell.cellId, explainStyle);
      setNarrative(res.narrative ?? 'No narrative returned');
      setGreenMeter(res.greenAiMeter ?? null);
    } catch (e) {
      setNarrative(String(e));
    } finally {
      setExplaining(false);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const id = await ensureValidated();
      if (!id) return;
      const blob = await exportAuditPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `audit_${id}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const freshness = cell.evidenceSources?.[0];
  const isAiPowered = greenMeter && greenMeter.provider !== 'templated-no-llm' && greenMeter.tokensIn > 0;
  const timeStr = cell.timeUtc ? new Date(cell.timeUtc).toLocaleString('en-GB', { hour12: false, timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' UTC' : '';

  return (
    <div style={{
      position: 'absolute', top: 16, right: 16, zIndex: 2000,
      width: 320, maxHeight: '88vh', overflowY: 'auto',
      background: 'rgba(15,23,42,0.97)', border: `1px solid ${tierBorder}55`,
      borderTop: `3px solid ${tierBorder}`,
      borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 14px 10px', background: tierBg, borderRadius: '8px 8px 0 0', borderBottom: '1px solid #1f2937' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 2 }}>{cell.region}</div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>{timeStr}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 20, lineHeight: 1, marginTop: -2 }}>×</button>
        </div>
        <div style={{ marginTop: 8 }}>
          <TierBadge tier={cell.derived.tier} />
        </div>
      </div>

      {/* Metrics */}
      <div style={{ padding: '10px 14px' }}>
        {/* CRS score bar */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: '#9ca3af' }}>Combined Risk Score</span>
            <span style={{ fontWeight: 700, color: '#fff' }}>{cell.derived.crs.toFixed(1)} / 100</span>
          </div>
          <div style={{ height: 5, background: '#1f2937', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${cell.derived.crs}%`, background: tierBorder, borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
        </div>

        <div className="metric-row">
          <span className="metric-label">Actions</span>
          <span className="metric-value" style={{ color: cell.derived.actionAllowed ? 'var(--green)' : '#6b7280', fontSize: 11, fontWeight: 700 }}>
            {cell.derived.actionAllowed ? '⚡ ENABLED' : '✓ NOT REQUIRED'}
          </span>
        </div>

        {/* Pollutants */}
        <div style={{ marginTop: 8, marginBottom: 4, fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Pollutants</div>
        {Object.entries(cell.pollutants).map(([name, p]) => (
          <div key={name} style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#9ca3af' }}>{name.toUpperCase()} <span style={{ fontSize: 10 }}>(PSI {p.psi})</span></span>
              <span style={{ fontWeight: 700 }}>{p.predicted.toFixed(1)} {p.unit}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b7280' }}>
              <span>PI95: [{p.pi95[0].toFixed(1)}, {p.pi95[1].toFixed(1)}]</span>
              <span>±{(p.uncertaintyNorm * 100).toFixed(0)}% uncertainty</span>
            </div>
          </div>
        ))}

        {/* Trust */}
        {cell.trust && (
          <>
            <div style={{ margin: '10px 0 4px', fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Trust &amp; Confidence</div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                <span style={{ color: '#9ca3af' }}>Overall Confidence</span>
                <span style={{ fontWeight: 700 }}>{(cell.trust.overallConfidence * 100).toFixed(0)}%</span>
              </div>
              <div style={{ height: 4, background: '#1f2937', borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${cell.trust.overallConfidence * 100}%`, background: '#0d61aa', borderRadius: 2 }} />
              </div>
            </div>
            <div className="metric-row" style={{ fontSize: 11 }}>
              <span className="metric-label">Sensor Confidence</span>
              <span className="metric-value">{(cell.trust.sensorConfidence * 100).toFixed(0)}%</span>
            </div>
            <div className="metric-row" style={{ fontSize: 11 }}>
              <span className="metric-label">Drift State</span>
              <span className="metric-value" style={{ color: cell.trust.driftState === 'NORMAL' ? 'var(--green)' : cell.trust.driftState === 'CAUTION' ? 'var(--amber)' : 'var(--red)' }}>
                {cell.trust.driftState}
              </span>
            </div>
          </>
        )}

        {freshness && (
          <div className="metric-row" style={{ fontSize: 11 }}>
            <span className="metric-label">Data Freshness</span>
            <span className="metric-value">{freshness.freshnessMinutes === 0 ? 'Live' : `${freshness.freshnessMinutes}min ago`}</span>
          </div>
        )}

        {cell.derived.reasonCodes.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {cell.derived.reasonCodes.map((c) => <span key={c} className="tag">{c}</span>)}
          </div>
        )}
      </div>

      {/* AI Explain section */}
      <div style={{ padding: '10px 14px 14px', borderTop: '1px solid #1f2937' }}>
        {/* Style toggle */}
        <div style={{ display: 'flex', marginBottom: 8, background: '#1f2937', borderRadius: 5, padding: 2, gap: 2 }}>
          {(['CITIZEN', 'CITY_OPS'] as const).map((s) => (
            <button key={s} onClick={() => setExplainStyle(s)} style={{
              flex: 1, padding: '4px 0', fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer', borderRadius: 3,
              background: explainStyle === s ? '#0d61aa' : 'transparent',
              color: explainStyle === s ? '#fff' : '#6b7280',
              letterSpacing: '0.4px',
            }}>
              {s === 'CITIZEN' ? '👤 Citizen' : '🏛 City Ops'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-primary btn-sm" onClick={handleExplain} disabled={explaining} style={{ flex: 1 }}>
            {explaining ? '⏳ Thinking...' : '✨ AI Explain'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleExportPdf} disabled={exporting} style={{ flex: 1 }}>
            {exporting ? 'Generating...' : '📄 Audit PDF'}
          </button>
        </div>

        {narrative && (
          <div style={{ marginTop: 10, background: '#0f172a', border: '1px solid #1f2937', borderRadius: 6, padding: 10, fontSize: 12, lineHeight: 1.65, color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
            {narrative}
          </div>
        )}

        {greenMeter && (
          <div style={{ marginTop: 8, background: '#0a1628', border: '1px solid #1f2937', borderRadius: 6, padding: '8px 10px', fontSize: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Green AI Meter</span>
              <span style={{ color: isAiPowered ? '#00882b' : '#6b7280', fontWeight: 700 }}>
                {isAiPowered ? `⚡ ${greenMeter.provider}` : '📋 Template (no LLM)'}
              </span>
            </div>
            {isAiPowered ? (
              <div style={{ color: '#9ca3af', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span>{greenMeter.tokensIn}→{greenMeter.tokensOut} tokens</span>
                <span>{greenMeter.energyWh.toFixed(5)} Wh</span>
                <span>{greenMeter.co2eGrams.toFixed(4)} gCO₂e</span>
              </div>
            ) : (
              <div style={{ color: '#6b7280', fontSize: 10 }}>
                Set <code style={{ background: '#1f2937', padding: '1px 4px', borderRadius: 3 }}>GREENPT_API_KEY</code> in explain service to enable GreenPT AI
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
