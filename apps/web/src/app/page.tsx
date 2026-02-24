'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Header } from '@/components/Header';
import { ScenarioPanel } from '@/components/ScenarioPanel';
import { DriftPanel } from '@/components/DriftPanel';

const AmsMap = dynamic(() => import('@/components/AmsMap').then((m) => ({ default: m.AmsMap })), {
  ssr: false,
  loading: () => <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>Loading map...</div>,
});

export default function HomePage() {
  const [replayMode, setReplayMode] = useState(false);
  const [viewMode, setViewMode] = useState<'netherlands' | 'world'>('netherlands');
  const [selectedCellId, setSelectedCellId] = useState<string | undefined>(undefined);

  return (
    <div className="app-shell">
      <Header
        replayMode={replayMode}
        onToggleReplay={() => setReplayMode((v) => !v)}
        viewMode={viewMode}
        onToggleView={setViewMode}
      />

      <div className="main-content">
        <div className="map-area">
          <AmsMap
            replayMode={replayMode}
            viewMode={viewMode}
            onCellSelect={setSelectedCellId}
          />
        </div>

        <aside className="sidebar">
          <ScenarioPanel selectedCellId={selectedCellId} viewMode={viewMode} />
          <DriftPanel />

          <div className="panel" style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <p className="panel-title">About</p>
            <p><strong style={{ color: 'var(--text)' }}>Hover</strong> any cell to see region, CRS &amp; pollutants. <strong style={{ color: 'var(--text)' }}>Click</strong> for full details &amp; AI explain.</p>
            <br />
            <p>Toggle <strong style={{ color: 'var(--text)' }}>🇳🇱 NL / 🌍 World</strong> to compare Netherlands against global hotspots.</p>
            <br />
            <p>Click a cell, then use the <strong style={{ color: 'var(--text)' }}>Scenario panel</strong> to simulate that cell under traffic reduction.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
