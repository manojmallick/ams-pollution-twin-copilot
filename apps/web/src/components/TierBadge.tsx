'use client';
import { TIER_COLORS, TIER_LABELS } from '@/lib/colors';

export function TierBadge({ tier }: { tier: string }) {
  const color = TIER_COLORS[tier] ?? '#888';
  const label = TIER_LABELS[tier] ?? tier;
  return (
    <span className="badge" style={{ background: color + '22', color, border: `1px solid ${color}55` }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}
