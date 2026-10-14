import net from 'node:net';

const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*\.?$/i;

/**
 * Normalise and validate a destination host (IPv4, IPv6, [IPv6] or DNS name).
 * The host is passed to ping/traceroute as an argument, so a value starting
 * with "-" would be read as an option; only real addresses/names are allowed.
 * Returns the cleaned host, or null when invalid.
 */
export function cleanHost(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let h = raw.trim();
  if (!h || h.startsWith('-')) return null;
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (net.isIP(h)) return h;
  return HOSTNAME_RE.test(h) ? h.toLowerCase() : null;
}
