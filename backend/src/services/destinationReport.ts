import PDFDocument from 'pdfkit';
import prisma from '../config/prisma';

const BLUE = '#2563eb';
const DARK = '#0f172a';
const GRAY = '#64748b';
const FAINT = '#94a3b8';
const LIGHT = '#f1f5f9';
const BORDER = '#e2e8f0';
const GREEN = '#059669';
const RED = '#dc2626';

function fmtDate(d?: Date | string | null): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function fmtRtt(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${v} ms`;
}

function truncate(doc: PDFKit.PDFDocument, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(`${t}…`) > width) t = t.slice(0, -1);
  return `${t}…`;
}

interface ReportInput {
  dest: {
    name: string;
    host: string;
    category: string;
    location: string;
    region: string;
    description: string;
    enabled: boolean;
    ipAddress: string;
    asn: number | null;
    company: string;
    registry: string;
    country: string;
    prefix: string;
    createdAt: Date;
  };
  latest: {
    startedAt: Date;
    durationMs: number;
    triggeredBy: string;
    reachable: boolean;
    pingPacketsSent: number;
    pingPacketsReceived: number;
    pingLossPercent: number;
    pingMinRtt: number | null;
    pingMaxRtt: number | null;
    pingAvgRtt: number | null;
    pathFingerprint: string;
    hops: Array<{
      ttl: number;
      ip: string | null;
      asn: number | null;
      company: string;
      avgRtt: number | null;
      status: string;
    }>;
  } | null;
  changes: Array<{ severity: string; summary: string; createdAt: Date; changesCount: number }>;
  total24h: number;
  reachable24h: number;
  avg24h: number | null;
}

export function renderPdf(input: ReportInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    info: { Title: `Upstream Monitor — ${input.dest.name}`, Author: 'Upstream Monitor' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const PAGE_W = 595.28;
  const X = 40;
  const CW = PAGE_W - 80;
  const PAGE_H = 841.89;

  /* ----------------------------- header band ----------------------------- */
  doc.roundedRect(X, 36, CW, 44, 6).fill(BLUE);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7).text('UPSTREAM MONITOR', X + 14, 45, { characterSpacing: 1.2 });
  doc.font('Helvetica-Bold').fontSize(16).text('Network Report', X + 14, 54);
  doc.font('Helvetica').fontSize(8).text(`Generated ${fmtDate(new Date())}`, X + CW - 14, 45, { align: 'right', width: 130 });
  doc.font('Helvetica').fontSize(8).text('Page 1 of 1', X + CW - 14, 58, { align: 'right', width: 130 });

  let y = 96;

  /* ------------------------------ title block ----------------------------- */
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(17).text(input.dest.name, X, y);
  y += 22;
  doc.fillColor(GRAY).font('Courier').fontSize(10).text(input.dest.host, X, y);
  y += 15;
  const meta = [
    input.dest.category ? input.dest.category.toUpperCase() : null,
    input.dest.location,
    input.dest.region,
    input.dest.description || null,
  ].filter(Boolean).join('  ·  ');
  doc.fillColor(FAINT).font('Helvetica').fontSize(8.5).text(meta || '—', X, y);
  y += 16;

  /* ------------------------------ facts grid ------------------------------ */
  const cellGap = 8;
  const cellW = (CW - cellGap * 3) / 4;
  const cellH = 40;
  const cells: Array<[string, string, boolean]> = [
    ['ASN', input.dest.asn ? `AS${input.dest.asn}` : '—', true],
    ['Company', input.dest.company || '—', false],
    ['Registry', input.dest.registry ? input.dest.registry.toUpperCase() : '—', false],
    ['Country', input.dest.country || '—', false],
    ['Resolved IP', input.dest.ipAddress || '—', true],
    ['Prefix', input.dest.prefix || '—', true],
    ['Category', input.dest.category || '—', false],
    ['Status', input.dest.enabled ? 'ENABLED' : 'DISABLED', false],
  ];
  cells.forEach(([label, value, mono], i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const cx = X + col * (cellW + cellGap);
    const cy = y + row * (cellH + 8);
    doc.roundedRect(cx, cy, cellW, cellH, 4).fill(LIGHT);
    doc.fillColor(FAINT).font('Helvetica-Bold').fontSize(6).text(label.toUpperCase(), cx + 8, cy + 7, { characterSpacing: 0.5 });
    const vfont = mono ? 'Courier-Bold' : 'Helvetica-Bold';
    doc.fillColor(DARK).font(vfont).fontSize(9).text(truncate(doc, value, cellW - 16), cx + 8, cy + 18);
  });
  y += 2 * (cellH + 8) + 12;

  /* ------------------------- network health (24h) ------------------------- */
  const uptimePct = input.total24h > 0 ? Math.round((input.reachable24h / input.total24h) * 1000) / 10 : 0;
  const status = input.latest ? (input.latest.reachable ? 'REACHABLE' : 'UNREACHABLE') : 'NO DATA';
  const statusColor = input.latest === null ? FAINT : input.latest.reachable ? GREEN : RED;

  doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(9).text('NETWORK HEALTH — LAST 24 HOURS', X, y, { characterSpacing: 0.8 });
  y += 14;
  const health = [
    ['Status', status, statusColor],
    ['Uptime', `${uptimePct}%`, uptimePct < 99 && input.total24h > 0 ? RED : GREEN],
    ['Avg RTT', fmtRtt(input.avg24h), DARK],
    ['Reports', String(input.total24h), DARK],
  ] as Array<[string, string, string]>;
  health.forEach(([label, value, color], i) => {
    const cx = X + i * (cellW + cellGap);
    doc.roundedRect(cx, y, cellW, 40, 4).fill(i === 0 ? (input.latest ? (input.latest.reachable ? '#ecfdf5' : '#fef2f2') : LIGHT) : LIGHT);
    doc.fillColor(FAINT).font('Helvetica-Bold').fontSize(6).text(label.toUpperCase(), cx + 8, y + 7, { characterSpacing: 0.5 });
    doc.fillColor(color).font('Helvetica-Bold').fontSize(11).text(value, cx + 8, y + 18);
  });
  y += 40 + 16;

  /* --------------------------- latest trace details ----------------------- */
  doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(9).text('LATEST TRACE REPORT', X, y, { characterSpacing: 0.8 });
  y += 14;
  const l = input.latest;
  const kvRows: Array<[string, string, string, string]> = l
    ? [
        ['Started', fmtDate(l.startedAt), 'Duration', `${l.durationMs} ms`],
        ['Trigger', l.triggeredBy, 'Ping', `${l.pingPacketsReceived}/${l.pingPacketsSent} received`],
        ['Loss', `${l.pingLossPercent}%`, 'RTT min / avg / max', `${fmtRtt(l.pingMinRtt)} / ${fmtRtt(l.pingAvgRtt)} / ${fmtRtt(l.pingMaxRtt)}`],
        ['Hops', String(l.hops.length), 'Path', truncate(doc, l.pathFingerprint || '—', 300)],
      ]
    : [['Latest trace', 'No trace report yet', '', '']];
  const lw = 78;
  const vw = (CW - lw * 2) / 2;
  kvRows.forEach(([lbl1, val1, lbl2, val2], i) => {
    const ry = y + i * 17;
    if (i % 2 === 0) doc.rect(X, ry, CW, 15).fill(i % 4 === 0 ? LIGHT : '#ffffff');
    doc.fillColor(FAINT).font('Helvetica-Bold').fontSize(6.5).text(lbl1.toUpperCase(), X + 8, ry + 4);
    doc.fillColor(DARK).font('Courier').fontSize(8).text(truncate(doc, val1, vw - 20), X + lw, ry + 4);
    if (lbl2) {
      doc.fillColor(FAINT).font('Helvetica-Bold').fontSize(6.5).text(lbl2.toUpperCase(), X + lw * 2 + 14, ry + 4);
      doc.fillColor(DARK).font('Courier').fontSize(8).text(truncate(doc, val2, vw - 34), X + lw * 2 + 14 + lw, ry + 4);
    }
  });
  y += kvRows.length * 17 + 14;

  /* ---------------------------- path table ------------------------------- */
  doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(9).text('NETWORK PATH — HOP BY HOP', X, y, { characterSpacing: 0.8 });
  y += 14;
  const cols = [
    { label: 'TTL', w: 26 },
    { label: 'IP', w: 135 },
    { label: 'ASN', w: 52 },
    { label: 'Company', w: 148 },
    { label: 'Avg RTT', w: 62 },
    { label: 'Status', w: 92 },
  ];
  const hops = l?.hops ?? [];
  const maxRows = Math.min(hops.length, 14);
  const rowH = 13.5;
  const headerH = 15;
  const tableH = headerH + maxRows * rowH;

  // Keep the whole block on a single page: trim rows if it would overflow.
  const fit = Math.max(0, Math.floor((PAGE_H - 40 - y - 70) / rowH));
  const rows = Math.min(maxRows, fit);

  // header
  doc.rect(X, y, CW, headerH).fill(BLUE);
  let cx = X;
  cols.forEach((c) => {
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(6.5).text(c.label.toUpperCase(), cx + 5, y + 4.5, { characterSpacing: 0.4 });
    cx += c.w;
  });
  y += headerH;
  for (let i = 0; i < rows; i++) {
    const h = hops[i];
    if (i % 2 === 1) doc.rect(X, y, CW, rowH).fill(LIGHT);
    cx = X;
    const vals = [
      String(h.ttl),
      h.ip ?? '*',
      h.asn ? `AS${h.asn}` : '—',
      h.company || '—',
      fmtRtt(h.avgRtt),
      h.status.toUpperCase(),
    ];
    vals.forEach((v, vi) => {
      const c = cols[vi];
      doc.fillColor(vi === 0 || vi === 1 || vi === 2 || vi === 4 ? DARK : GRAY);
      doc.font(vi === 1 || vi === 2 || vi === 4 ? 'Courier' : 'Helvetica').fontSize(7.5);
      doc.text(truncate(doc, v, c.w - 10), cx + 5, y + 3.5);
      cx += c.w;
    });
    y += rowH;
  }
  if (rows < hops.length) {
    doc.fillColor(FAINT).font('Helvetica').fontSize(7).text(`(+${hops.length - rows} more hops omitted)`, X, y + 3);
    y += 16;
  } else {
    y += 8;
  }

  /* ----------------------------- recent changes -------------------------- */
  doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(9).text('RECENT CHANGE EVENTS', X, y, { characterSpacing: 0.8 });
  y += 14;
  const changes = input.changes;
  if (changes.length === 0) {
    doc.fillColor(FAINT).font('Helvetica').fontSize(8).text('No change events recorded for this destination.', X, y);
    y += 16;
  } else {
    const cRows = Math.min(changes.length, 4);
    for (let i = 0; i < cRows; i++) {
      const c = changes[i];
      if (y > PAGE_H - 46) break;
      if (i % 2 === 1) doc.rect(X, y, CW, 14).fill(LIGHT);
      const sevColor = c.severity === 'critical' ? RED : c.severity === 'warning' ? '#d97706' : BLUE;
      doc.fillColor(sevColor).font('Helvetica-Bold').fontSize(7).text(c.severity.toUpperCase(), X + 5, y + 3.5);
      doc.fillColor(FAINT).font('Helvetica').fontSize(7).text(fmtDate(c.createdAt).slice(0, 16), X + 66, y + 3.5);
      doc.fillColor(DARK).font('Helvetica').fontSize(7.5).text(truncate(doc, c.summary, CW - 240), X + 150, y + 3.5);
      y += 14;
    }
    if (changes.length > cRows) {
      doc.fillColor(FAINT).font('Helvetica').fontSize(7).text(`(+${changes.length - cRows} more)`, X, y + 2);
      y += 14;
    }
  }

  /* --------------------------------- footer ------------------------------- */
  y = PAGE_H - 40;
  doc.moveTo(X, y).lineTo(X + CW, y).strokeColor(BORDER).lineWidth(0.6).stroke();
  doc.fillColor(FAINT).font('Helvetica').fontSize(7).text(
    `Upstream Monitor · Report for ${input.dest.host} · ${fmtDate(new Date())}`,
    X,
    y + 6,
    { align: 'center', width: CW }
  );

  doc.end();
  return finished;
}

/**
 * Build a single-page branded PDF report for one destination covering its
 * registration data, 24h health, latest trace and network path.
 */
export async function buildDestinationReport(destinationId: string): Promise<Buffer | null> {
  const dest = await prisma.destination.findUnique({ where: { id: destinationId } });
  if (!dest) return null;

  const latest = await prisma.traceReport.findFirst({
    where: { destinationId },
    orderBy: { startedAt: 'desc' },
    include: { hops: { orderBy: { ttl: 'asc' } } },
  });

  const changes = await prisma.changeEvent.findMany({
    where: { destinationId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { _count: { select: { changes: true } } },
  });

  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [total24h, reachable24h, avg] = await Promise.all([
    prisma.traceReport.count({ where: { destinationId, startedAt: { gte: since } } }),
    prisma.traceReport.count({ where: { destinationId, startedAt: { gte: since }, reachable: true } }),
    prisma.traceReport.aggregate({
      where: { destinationId, startedAt: { gte: since } },
      _avg: { pingAvgRtt: true },
    }),
  ]);

  return renderPdf({
    dest: {
      name: dest.name,
      host: dest.host,
      category: dest.category,
      location: dest.location,
      region: dest.region,
      description: dest.description,
      enabled: dest.enabled,
      ipAddress: dest.ipAddress,
      asn: dest.asn,
      company: dest.company,
      registry: dest.registry,
      country: dest.country,
      prefix: dest.prefix,
      createdAt: dest.createdAt,
    },
    latest: latest
      ? {
          startedAt: latest.startedAt,
          durationMs: latest.durationMs,
          triggeredBy: latest.triggeredBy,
          reachable: latest.reachable,
          pingPacketsSent: latest.pingPacketsSent,
          pingPacketsReceived: latest.pingPacketsReceived,
          pingLossPercent: latest.pingLossPercent,
          pingMinRtt: latest.pingMinRtt,
          pingMaxRtt: latest.pingMaxRtt,
          pingAvgRtt: latest.pingAvgRtt,
          pathFingerprint: latest.pathFingerprint,
          hops: latest.hops.map((h) => ({
            ttl: h.ttl,
            ip: h.ip,
            asn: h.asn,
            company: h.company,
            avgRtt: h.avgRtt,
            status: h.status,
          })),
        }
      : null,
    changes: changes.map((c) => ({
      severity: c.severity,
      summary: c.summary,
      createdAt: c.createdAt,
      changesCount: c._count.changes,
    })),
    total24h,
    reachable24h,
    avg24h: avg._avg.pingAvgRtt ?? null,
  });
}