import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { ValidatedTwinOutput } from '@ams-twin/contracts';

const BRAND_BLUE = rgb(0.07, 0.38, 0.67);
const BRAND_GRAY = rgb(0.4, 0.4, 0.4);
const BLACK = rgb(0, 0, 0);
const RED = rgb(0.8, 0.1, 0.1);
const GREEN_C = rgb(0.0, 0.55, 0.27);

function tierColor(tier: string) {
  switch (tier) {
    case 'PURPLE': return rgb(0.5, 0.0, 0.5);
    case 'RED': return RED;
    case 'AMBER': return rgb(0.9, 0.6, 0.0);
    case 'GREEN': return GREEN_C;
    default: return BRAND_GRAY;
  }
}

export async function generateAuditPdf(payload: ValidatedTwinOutput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let y = height - 40;

  // Header
  page.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: BRAND_BLUE });
  page.drawText('Amsterdam Pollution Twin — Audit Snapshot', {
    x: 20, y: height - 38, size: 16, font: boldFont, color: rgb(1, 1, 1),
  });
  page.drawText(`Generated: ${new Date().toISOString()}`, {
    x: 20, y: height - 54, size: 8, font: regularFont, color: rgb(0.8, 0.9, 1),
  });

  y = height - 80;

  // Section helper
  const section = (title: string) => {
    y -= 16;
    page.drawText(title, { x: 20, y, size: 11, font: boldFont, color: BRAND_BLUE });
    y -= 4;
    page.drawLine({ start: { x: 20, y }, end: { x: width - 20, y }, thickness: 0.5, color: BRAND_BLUE });
    y -= 12;
  };

  const row = (label: string, value: string, valueColor = BLACK) => {
    page.drawText(label + ':', { x: 25, y, size: 9, font: boldFont, color: BRAND_GRAY });
    page.drawText(value, { x: 200, y, size: 9, font: regularFont, color: valueColor });
    y -= 14;
  };

  // Identification
  section('1. Identification');
  row('Request ID', payload.requestId);
  row('Region', payload.region);
  row('Time (UTC)', payload.timeUtc);
  row('Cell ID (H3)', payload.grid.cellId);
  row('H3 Resolution', String(payload.grid.resolution));

  // Risk Assessment
  section('2. Risk Assessment');
  row('Tier', payload.derived.tier, tierColor(payload.derived.tier));
  row('CRS Score', payload.derived.crs.toFixed(2) + ' / 100');
  row('Action Allowed', payload.derived.actionAllowed ? 'YES' : 'NO',
    payload.derived.actionAllowed ? GREEN_C : RED);
  row('Persistence', (payload.derived.persistence * 100).toFixed(0) + '%');
  row('Exposure Norm', (payload.derived.exposureNorm * 100).toFixed(0) + '%');
  if (payload.derived.reasonCodes.length > 0) {
    row('Reason Codes', payload.derived.reasonCodes.join(', '));
  }

  // Pollutants
  section('3. Pollutant Measurements');
  for (const [name, p] of Object.entries(payload.pollutants)) {
    row(
      name.toUpperCase(),
      `${p.predicted.toFixed(1)} ${p.unit}  |  PSI: ${p.psi}  |  PI95: [${p.pi95[0].toFixed(1)}, ${p.pi95[1].toFixed(1)}]  |  Unc: ${(p.uncertaintyNorm * 100).toFixed(0)}%`
    );
  }

  // Trust
  section('4. Trust & Confidence');
  row('Sensor Confidence', (payload.trust.sensorConfidence * 100).toFixed(1) + '%');
  row('Overall Confidence', (payload.trust.overallConfidence * 100).toFixed(1) + '%');
  row('Drift State', payload.trust.driftState);
  const cb = payload.trust.confidenceBreakdown;
  row('  Completeness', (cb.completeness * 100).toFixed(0) + '%');
  row('  Timeliness', (cb.timeliness * 100).toFixed(0) + '%');
  row('  Calibration', (cb.calibration * 100).toFixed(0) + '%');
  row('  Cross-Agreement', (cb.crossAgreement * 100).toFixed(0) + '%');
  row('  Anomaly Rate', (cb.anomalyRate * 100).toFixed(0) + '%');
  row('  Model Uncertainty', (cb.modelUncertainty * 100).toFixed(0) + '%');
  row('  Backtest Score', (cb.backtestScore * 100).toFixed(0) + '%');
  row('  Drift Penalty', (cb.driftPenalty * 100).toFixed(0) + '%');

  // Evidence
  section('5. Evidence Sources');
  for (const src of payload.evidence.sources) {
    row(src.sourceId, `${src.type} | ${src.lastSeenUtc} | ${src.freshnessMinutes}min | ${src.license}`);
  }
  row('Normalizer v', payload.evidence.versions.normalizer);
  row('Twin Model v', payload.evidence.versions.twinModel);
  row('Rules Engine v', payload.evidence.versions.rulesEngine);

  // Actions
  section('6. Eligible Actions');
  const eligibleActions = payload.actions.filter((a) => a.eligible);
  if (eligibleActions.length === 0) {
    page.drawText('No actions eligible at current tier/confidence', {
      x: 25, y, size: 9, font: regularFont, color: BRAND_GRAY,
    });
    y -= 14;
  } else {
    for (const action of eligibleActions) {
      row(action.actionId, `Category: ${action.category} | Priority: ${action.priority}`);
    }
  }

  // Signature
  section('7. Cryptographic Signature');
  row('Algorithm', payload.signature.alg);
  row('Public Key Fingerprint', payload.signature.publicKeyFingerprint);
  // Break long hashes across lines
  page.drawText('SHA-256 Hash:', { x: 25, y, size: 9, font: boldFont, color: BRAND_GRAY });
  y -= 12;
  page.drawText(payload.signature.payloadSha256, { x: 25, y, size: 7, font: regularFont, color: BLACK });
  y -= 12;
  page.drawText('Ed25519 Signature (Base64):', { x: 25, y, size: 9, font: boldFont, color: BRAND_GRAY });
  y -= 12;
  // Truncate for display
  const sig = payload.signature.signatureB64;
  page.drawText(sig.slice(0, 80) + '...', { x: 25, y, size: 7, font: regularFont, color: BLACK });
  y -= 20;

  // Verification instructions
  section('8. Verification Steps');
  const verSteps = [
    '1. Extract embedded SHA-256 hash from this document',
    '2. Download canonical JSON via /v1/trust/payload/' + payload.requestId,
    '3. SHA-256 hash the JSON — must match embedded hash',
    '4. Verify Ed25519 signature using public key fingerprint',
    '5. Confirm versions match evidence.versions in the JSON',
  ];
  for (const step of verSteps) {
    page.drawText(step, { x: 25, y, size: 8, font: regularFont, color: BRAND_GRAY });
    y -= 13;
  }

  // Footer
  page.drawRectangle({ x: 0, y: 0, width, height: 28, color: BRAND_BLUE });
  page.drawText('Amsterdam Pollution Twin Copilot — Hack for Humanity 2026 — MIT License', {
    x: 20, y: 10, size: 7, font: regularFont, color: rgb(0.8, 0.9, 1),
  });

  return pdfDoc.save();
}
