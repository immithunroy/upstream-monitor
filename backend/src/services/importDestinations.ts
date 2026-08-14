import XLSX from 'xlsx';
import prisma from '../config/prisma';
import { enrichDestinationHost } from './enrich';

export interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; host: string; error: string }>;
}

const VALID_CATEGORIES = ['service', 'datacenter', 'ixp', 'utility', 'cdn'];

const HEADER_ALIASES: Record<string, string> = {
  name: 'name',
  destination: 'name',
  host: 'host',
  hostname: 'host',
  address: 'host',
  ip: 'host',
  category: 'category',
  type: 'category',
  location: 'location',
  city: 'location',
  region: 'region',
  description: 'description',
  desc: 'description',
  notes: 'description',
  enabled: 'enabled',
  active: 'enabled',
};

function normalizeHeader(raw: unknown): string | null {
  const key = String(raw ?? '').trim().toLowerCase();
  if (HEADER_ALIASES[key]) return HEADER_ALIASES[key];
  const compact = key.replace(/[\s_-]+/g, '');
  if (HEADER_ALIASES[compact]) return HEADER_ALIASES[compact];
  return null;
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return ['yes', 'true', '1', 'y', 'on'].includes(String(v).trim().toLowerCase());
}

interface ImportRow {
  row: number;
  name: string;
  host: string;
  category: string;
  location: string;
  region: string;
  description: string;
  enabled: boolean;
}

/** Parse an uploaded XLSX/CSV buffer into destination rows. */
export function parseImportBuffer(buffer: Buffer): ImportRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

  // Locate the header row: the first row where at least two known columns match.
  let headerIndex = -1;
  let columns: Array<{ field: string; index: number }> = [];
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const mapped = (rows[i] as unknown[]).map(normalizeHeader);
    if (mapped.filter((m): m is string => !!m).length >= 2) {
      headerIndex = i;
      columns = mapped
        .map((field, index) => ({ field: field as string, index }))
        .filter((c) => c.field);
      break;
    }
  }
  if (headerIndex < 0) return [];

  const out: ImportRow[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const cells = (rows[i] as unknown[]) ?? [];
    const get = (field: string): unknown => {
      const col = columns.find((c) => c.field === field);
      return col ? cells[col.index] : '';
    };
    const name = String(get('name') ?? '').trim();
    const host = String(get('host') ?? '').trim();
    if (!name && !host) continue; // skip fully-blank rows
    out.push({
      row: i + 1,
      name,
      host,
      category: String(get('category') ?? '').trim().toLowerCase() || 'service',
      location: String(get('location') ?? '').trim(),
      region: String(get('region') ?? '').trim(),
      description: String(get('description') ?? '').trim(),
      enabled: toBool(get('enabled')) !== false,
    });
  }
  return out;
}

/** Create destinations from parsed rows, skipping invalid/duplicate ones. */
export async function importDestinations(rows: ImportRow[]): Promise<ImportResult> {
  const result: ImportResult = { total: rows.length, created: 0, skipped: 0, failed: 0, errors: [] };
  const seenHosts = new Set<string>();

  for (const row of rows) {
    const error = validateRow(row);
    if (error) {
      result.failed += 1;
      result.errors.push({ row: row.row, host: row.host, error });
      continue;
    }
    if (seenHosts.has(row.host.toLowerCase())) {
      result.skipped += 1;
      result.errors.push({ row: row.row, host: row.host, error: 'Duplicate host within the file (already handled above)' });
      continue;
    }
    seenHosts.add(row.host.toLowerCase());
    try {
      await prisma.destination.create({
        data: {
          name: row.name,
          host: row.host,
          category: row.category,
          location: row.location,
          region: row.region,
          description: row.description,
          enabled: row.enabled,
          createdBy: 'import',
        },
      });
      // Fire-and-forget RIR attribution for the new host.
      void enrichDestinationHost(row.host).then((data) =>
        prisma.destination.update({
          where: { host: row.host },
          data: { ...data, enrichedAt: new Date() },
        })
      );
      result.created += 1;
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        result.skipped += 1;
        result.errors.push({ row: row.row, host: row.host, error: 'A destination with this host already exists' });
      } else {
        result.failed += 1;
        result.errors.push({ row: row.row, host: row.host, error: (err as Error).message });
      }
    }
  }
  return result;
}

function validateRow(row: ImportRow): string | null {
  if (!row.name) return 'Missing "Name"';
  if (!row.host) return 'Missing "Host"';
  if (!VALID_CATEGORIES.includes(row.category)) {
    return `Invalid category "${row.category}" (expected one of ${VALID_CATEGORIES.join(', ')})`;
  }
  return null;
}

/** Build an .xlsx template file with a header row and example rows. */
export function buildImportTemplate(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Name', 'Host', 'Category', 'Location', 'Region', 'Description', 'Enabled'],
    ['Example Service', 'example.com', 'service', 'London', 'Europe', 'Example description', 'yes'],
    ['Example DNS', '1.1.1.1', 'service', 'Global', 'Global', 'Public resolver', 'yes'],
    ['Example IXP', 'ix.example.net', 'ixp', 'Frankfurt', 'Europe', '', 'no'],
  ]);
  ws['!cols'] = [
    { wch: 22 }, { wch: 30 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 40 }, { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Destinations');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}