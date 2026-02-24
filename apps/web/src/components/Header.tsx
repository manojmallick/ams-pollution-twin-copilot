'use client';
import { useState } from 'react';
import { pullIngest } from '@/lib/api';

export function Header({
  replayMode,
  onToggleReplay,
  viewMode,
  onToggleView,
}: {
  replayMode: boolean;
  onToggleReplay: () => void;
  viewMode: 'netherlands' | 'world';
  onToggleView: (v: 'netherlands' | 'world') => void;
}) {
  const [pulling, setPulling] = useState(false);
  const [lastPull, setLastPull] = useState<string | null>(null);

  const handlePull = async () => {
    setPulling(true);
    try {
      await pullIngest();
      setLastPull(new Date().toLocaleTimeString());
    } finally {
      setPulling(false);
    }
  };

  return (
    <header>
      <div>
        <h1>Amsterdam Pollution Twin Copilot</h1>
        <div className="subtitle">Validated · Auditable · Grounded — Hack for Humanity 2026</div>
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        {lastPull && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Last pull: {lastPull}</span>}

        {/* View mode segmented toggle */}
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: 2, gap: 2 }}>
          {(['netherlands', 'world'] as const).map((mode) => (
            <button
              key={mode}
              className="btn btn-sm"
              onClick={() => onToggleView(mode)}
              style={{
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 700,
                background: viewMode === mode ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: viewMode === mode ? '#fff' : 'rgba(255,255,255,0.5)',
                border: viewMode === mode ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                borderRadius: 4,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {mode === 'netherlands' ? '🇳🇱 NL' : '🌍 World'}
            </button>
          ))}
        </div>

        <button
          className={`btn btn-sm ${replayMode ? 'btn-primary' : 'btn-ghost'}`}
          onClick={onToggleReplay}
          style={replayMode ? { background: '#e8a000', color: 'black' } : {}}
        >
          {replayMode ? 'REPLAY' : 'LIVE'}
        </button>

        <button className="btn btn-ghost btn-sm" onClick={handlePull} disabled={pulling}>
          {pulling ? 'Pulling...' : 'Pull Data'}
        </button>
      </div>
    </header>
  );
}
