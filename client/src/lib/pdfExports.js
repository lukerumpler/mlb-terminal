const COLORS = Object.freeze({
  navy: [17, 35, 52],
  ink: [31, 38, 44],
  muted: [102, 111, 119],
  amber: [194, 133, 42],
  teal: [35, 137, 119],
  rust: [178, 82, 65],
  line: [220, 218, 210],
  pale: [247, 244, 236],
});

function safe(value, fallback = '—') {
  return value == null || value === '' ? fallback : String(value);
}

export function formatPdfCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const sign = number < 0 ? '−' : '';
  const abs = Math.abs(number);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

export function buildPlayerValuationCardModel({
  playerName,
  teamName,
  position,
  season,
  verdict,
  score,
  archetype,
  kpis = {},
  axes = [],
  headlineRows = [],
  contractData,
  teamFinancials,
  projection,
} = {}) {
  return {
    title: 'SKIP PLAYER VALUATION CARD',
    playerName: safe(playerName, 'Player'),
    teamName: safe(teamName, 'Team unavailable'),
    position: safe(position),
    season: safe(season),
    verdict: safe(verdict),
    score: Number.isFinite(Number(score)) ? Number(score) : null,
    archetype: safe(archetype),
    kpis: Object.entries(kpis).filter(([key, value]) => ['CAS', 'DQS', 'DPI', 'TPVI'].includes(key) && Number.isFinite(Number(value))).map(([key, value]) => ({ label: key, value: Math.round(Number(value)) })),
    axes: Array.isArray(axes) ? axes.filter(axis => Number.isFinite(Number(axis?.value))).map(axis => ({ label: safe(axis.label, axis.axis), value: Math.max(0, Math.min(100, Number(axis.value))) })) : [],
    headlineRows: headlineRows.map(row => ({ label: safe(row?.label), value: safe(row?.value) })),
    contract: {
      aav: contractData?.aav ?? null,
      total: contractData?.total ?? null,
      status: contractData?.contractAvailable ? safe(contractData.status) : 'No verified contract data',
    },
    teamFinancials: teamFinancials || null,
    projection: projection || null,
    sources: [
      'MLB Stats API and Baseball Savant inputs supplied to SKIP',
      contractData?.source || 'Contract source unavailable',
      teamFinancials?.source || 'Team financial source unavailable',
    ],
  };
}

export function buildExecutiveScoutingSummaryModel({
  playerName,
  teamName,
  position,
  season,
  verdict,
  score,
  archetype,
  strengths = [],
  risks = [],
  recommendation,
  headlineRows = [],
  kpis = {},
  teamFinancials,
  projection,
} = {}) {
  return {
    title: 'SKIP EXECUTIVE SCOUTING SUMMARY',
    playerName: safe(playerName, 'Player'),
    teamName: safe(teamName, 'Team unavailable'),
    position: safe(position),
    season: safe(season),
    verdict: safe(verdict),
    score: Number.isFinite(Number(score)) ? Number(score) : null,
    archetype: safe(archetype),
    strengths: Array.isArray(strengths) ? strengths.map(item => safe(item)).filter(Boolean) : [],
    risks: Array.isArray(risks) ? risks.map(item => safe(item)).filter(Boolean) : [],
    recommendation: safe(recommendation, 'No recommendation available.'),
    headlineRows: headlineRows.map(row => ({ label: safe(row?.label), value: safe(row?.value) })),
    kpis: Object.entries(kpis).filter(([key, value]) => ['CAS', 'DQS', 'DPI', 'TPVI'].includes(key) && Number.isFinite(Number(value))).map(([key, value]) => ({ label: key, value: Math.round(Number(value)) })),
    teamFinancials: teamFinancials || null,
    projection: projection || null,
    sources: [
      'SKIP model outputs based on current loaded MLB/Savant data',
      teamFinancials?.source || 'Team financial source unavailable',
      'MLB Competitive Balance Tax glossary for repeater-tier definitions',
    ],
  };
}

function setFont(pdf, size, color = COLORS.ink, bold = false) {
  pdf.setFont('helvetica', bold ? 'bold' : 'normal');
  pdf.setFontSize(size);
  pdf.setTextColor(...color);
}

function wrap(pdf, text, x, y, width, lineHeight = 13) {
  const lines = pdf.splitTextToSize(String(text), width);
  pdf.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function section(pdf, label, x, y, width, color = COLORS.amber) {
  pdf.setDrawColor(...color);
  pdf.setLineWidth(1.4);
  pdf.line(x, y - 5, x, y + 9);
  setFont(pdf, 9, color, true);
  pdf.text(label.toUpperCase(), x + 7, y + 4);
  pdf.setDrawColor(...COLORS.line);
  pdf.setLineWidth(0.5);
  pdf.line(x, y + 12, x + width, y + 12);
  return y + 28;
}

function header(pdf, model, subtitle) {
  const width = pdf.internal.pageSize.getWidth();
  pdf.setFillColor(...COLORS.navy);
  pdf.rect(0, 0, width, 86, 'F');
  setFont(pdf, 9, [222, 232, 231], true);
  pdf.text(model.title, 42, 28);
  setFont(pdf, 24, [255, 255, 255], true);
  pdf.text(model.playerName, 42, 55);
  setFont(pdf, 9, [207, 216, 220]);
  pdf.text(`${model.teamName} · ${model.position} · ${model.season}`, 42, 72);
  setFont(pdf, 8, [213, 219, 222]);
  pdf.text(subtitle, width - 42, 28, { align: 'right' });
}

function drawMetricGrid(pdf, model, x, y, width) {
  const values = model.kpis.length ? model.kpis : [{ label: 'SKIP', value: '—' }];
  const cellWidth = width / Math.min(4, values.length);
  values.slice(0, 4).forEach((item, index) => {
    const cellX = x + index * cellWidth;
    pdf.setFillColor(...COLORS.pale);
    pdf.roundedRect(cellX, y, cellWidth - 6, 43, 4, 4, 'F');
    setFont(pdf, 8, COLORS.muted, true);
    pdf.text(item.label, cellX + 10, y + 15);
    setFont(pdf, 19, COLORS.navy, true);
    pdf.text(safe(item.value), cellX + 10, y + 35);
  });
}

function drawRadar(pdf, axes, x, y, radius) {
  if (!axes.length) {
    setFont(pdf, 9, COLORS.muted);
    pdf.text('Percentile radar unavailable', x, y);
    return;
  }
  const cx = x + radius;
  const cy = y + radius;
  const count = axes.length;
  for (let ring = 1; ring <= 4; ring += 1) {
    const ringRadius = radius * ring / 4;
    const points = axes.map((_, index) => {
      const angle = -Math.PI / 2 + index * 2 * Math.PI / count;
      return [cx + Math.cos(angle) * ringRadius, cy + Math.sin(angle) * ringRadius];
    });
    pdf.setDrawColor(...COLORS.line);
    pdf.setLineWidth(0.5);
    points.forEach((point, index) => pdf.line(point[0], point[1], points[(index + 1) % points.length][0], points[(index + 1) % points.length][1]));
  }
  axes.forEach((axis, index) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / count;
    const outerX = cx + Math.cos(angle) * radius;
    const outerY = cy + Math.sin(angle) * radius;
    pdf.setDrawColor(...COLORS.line);
    pdf.line(cx, cy, outerX, outerY);
    setFont(pdf, 7.5, COLORS.muted, true);
    const labelX = cx + Math.cos(angle) * (radius + 13);
    const labelY = cy + Math.sin(angle) * (radius + 13);
    pdf.text(axis.label, labelX, labelY, { align: Math.cos(angle) > 0.25 ? 'left' : Math.cos(angle) < -0.25 ? 'right' : 'center' });
  });
  const polygon = axes.map((axis, index) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / count;
    const pointRadius = radius * Number(axis.value) / 100;
    return [cx + Math.cos(angle) * pointRadius, cy + Math.sin(angle) * pointRadius];
  });
  pdf.setFillColor(194, 133, 42, 30);
  pdf.setDrawColor(...COLORS.amber);
  pdf.setLineWidth(1.5);
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    pdf.line(point[0], point[1], next[0], next[1]);
  });
  // A translucent fill is not consistently supported across jsPDF builds;
  // keep the outline deterministic and readable in every viewer.
}

function drawRows(pdf, rows, x, y, width) {
  let cursor = y;
  rows.forEach((row, index) => {
    if (index % 2 === 0) {
      pdf.setFillColor(...COLORS.pale);
      pdf.rect(x, cursor - 10, width, 21, 'F');
    }
    setFont(pdf, 8.5, COLORS.muted);
    pdf.text(row.label, x + 8, cursor + 3);
    setFont(pdf, 9, COLORS.ink, true);
    pdf.text(row.value, x + width - 8, cursor + 3, { align: 'right' });
    cursor += 21;
  });
  return cursor;
}

function drawFinancialBlock(pdf, model, x, y, width) {
  const tax = model.teamFinancials?.tax;
  const payroll = model.teamFinancials?.payroll;
  const projectionRows = model.projection?.rows?.slice(0, 5).map(row => ({ label: `${row.season} CBT / tax`, value: `${formatPdfCurrency(row.estimatedTax)} · ${safe(row.repeaterTier)}` })) || [];
  const rows = [
    { label: 'Team tax payroll', value: formatPdfCurrency(tax?.taxPayroll) },
    { label: 'CBT threshold', value: formatPdfCurrency(tax?.taxThreshold) },
    { label: 'Estimated tax bill', value: formatPdfCurrency(tax?.estimatedTaxBill) },
    { label: 'Tax space', value: formatPdfCurrency(tax?.taxSpace) },
    { label: 'Current repeater tier', value: safe(tax?.repeaterTier, 'History unavailable') },
    ...projectionRows,
  ];
  if (!payroll && !tax && !projectionRows.length) rows.push({ label: 'Financial context', value: 'Unavailable' });
  return drawRows(pdf, rows, x, y, width);
}

function addFooter(pdf, model) {
  const pageHeight = pdf.internal.pageSize.getHeight();
  const width = pdf.internal.pageSize.getWidth();
  setFont(pdf, 7.5, COLORS.muted);
  pdf.text(`SKIP Baseball Intelligence Terminal · ${model.season}`, 42, pageHeight - 30);
  pdf.text('Sources: ' + model.sources.join(' · '), 42, pageHeight - 18, { maxWidth: width - 84 });
}

export async function downloadPlayerValuationCardPdf(model) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true });
  const width = pdf.internal.pageSize.getWidth();
  header(pdf, model, 'PLAYER VALUATION');
  let y = 116;
  section(pdf, 'Decision snapshot', 42, y, width - 84, COLORS.amber); y += 28;
  drawMetricGrid(pdf, model, 42, y, width - 84); y += 60;
  const scoreLabel = model.score == null ? '—' : `${model.score}/100`;
  drawRows(pdf, [
    { label: 'SKIP verdict', value: model.verdict },
    { label: 'Archetype', value: model.archetype },
    { label: 'Decision score', value: scoreLabel },
    { label: 'Contract status', value: model.contract.status },
    { label: 'AAV', value: formatPdfCurrency(model.contract.aav) },
  ], 42, y, width - 84);
  y += 135;
  section(pdf, 'Percentile profile', 42, y, width - 84, COLORS.teal); y += 24;
  drawRadar(pdf, model.axes, 56, y, 92);
  y += 205;
  section(pdf, 'Current performance', 42, y, width - 84, COLORS.navy); y += 26;
  drawRows(pdf, model.headlineRows.length ? model.headlineRows : [{ label: 'Performance inputs', value: 'Unavailable' }], 42, y, width - 84);
  y += Math.max(40, model.headlineRows.length * 21 + 20);
  section(pdf, 'Financial context', 42, y, width - 84, COLORS.purple || COLORS.navy); y += 26;
  drawFinancialBlock(pdf, model, 42, y, width - 84);
  addFooter(pdf, model);
  const fileName = `skip-${model.playerName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-valuation-card-${model.season}.pdf`;
  pdf.setProperties({ title: model.title, subject: 'SKIP player valuation card', author: 'SKIP Baseball Intelligence Terminal' });
  pdf.save(fileName);
}

export async function downloadExecutiveScoutingSummaryPdf(model) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true });
  const width = pdf.internal.pageSize.getWidth();
  header(pdf, model, 'EXECUTIVE BRIEF');
  let y = 116;
  section(pdf, 'Executive decision', 42, y, width - 84, COLORS.purple || COLORS.navy); y += 28;
  drawMetricGrid(pdf, model, 42, y, width - 84); y += 60;
  drawRows(pdf, [
    { label: 'SKIP verdict', value: model.verdict },
    { label: 'Archetype', value: model.archetype },
    { label: 'Decision score', value: model.score == null ? '—' : `${model.score}/100` },
  ], 42, y, width - 84);
  y += 88;
  section(pdf, 'Strengths and risks', 42, y, width - 84, COLORS.teal); y += 25;
  const columnWidth = (width - 100) / 2;
  setFont(pdf, 9, COLORS.teal, true); pdf.text('STRENGTHS', 42, y);
  setFont(pdf, 9, COLORS.rust, true); pdf.text('RISKS', 52 + columnWidth, y);
  y += 15;
  setFont(pdf, 9, COLORS.ink);
  let leftY = y; model.strengths.slice(0, 6).forEach(item => { leftY = wrap(pdf, `• ${item}`, 42, leftY, columnWidth - 10, 12) + 2; });
  let rightY = y; model.risks.slice(0, 6).forEach(item => { rightY = wrap(pdf, `• ${item}`, 52 + columnWidth, rightY, columnWidth - 10, 12) + 2; });
  y = Math.max(leftY, rightY) + 18;
  section(pdf, 'Recommendation', 42, y, width - 84, COLORS.amber); y += 24;
  setFont(pdf, 10, COLORS.ink); y = wrap(pdf, model.recommendation, 42, y, width - 84, 15) + 15;
  section(pdf, 'Financial decision context', 42, y, width - 84, COLORS.navy); y += 26;
  drawFinancialBlock(pdf, model, 42, y, width - 84);
  addFooter(pdf, model);
  pdf.setProperties({ title: model.title, subject: 'SKIP executive scouting summary', author: 'SKIP Baseball Intelligence Terminal' });
  const fileName = `skip-${model.playerName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-executive-summary-${model.season}.pdf`;
  pdf.save(fileName);
}
