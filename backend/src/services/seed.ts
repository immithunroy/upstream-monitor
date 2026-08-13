import prisma from '../config/prisma';

export interface SeedTarget {
  name: string;
  host: string;
  category: 'service' | 'datacenter' | 'ixp' | 'utility' | 'cdn';
  location: string;
  region: string;
  description: string;
}

export const SEED_TARGETS: SeedTarget[] = [
  /* ---------------------------- Internet services ---------------------------- */
  { name: 'Google', host: 'google.com', category: 'service', location: 'Mountain View, CA', region: 'Americas', description: 'Google global edge / search' },
  { name: 'Google DNS', host: '8.8.8.8', category: 'service', location: 'Global', region: 'Global', description: 'Google public DNS' },
  { name: 'Meta (Facebook)', host: 'facebook.com', category: 'service', location: 'Menlo Park, CA', region: 'Americas', description: 'Meta platform edge' },
  { name: 'Instagram (Meta)', host: 'instagram.com', category: 'service', location: 'Global', region: 'Global', description: 'Meta-owned Instagram edge' },
  { name: 'WhatsApp (Meta)', host: 'whatsapp.com', category: 'service', location: 'Global', region: 'Global', description: 'Meta-owned WhatsApp edge' },
  { name: 'Microsoft', host: 'microsoft.com', category: 'service', location: 'Redmond, WA', region: 'Americas', description: 'Microsoft global edge' },
  { name: 'Microsoft Azure', host: 'azure.microsoft.com', category: 'service', location: 'Global', region: 'Global', description: 'Azure public cloud' },
  { name: 'Microsoft 365', host: 'www.office.com', category: 'service', location: 'Global', region: 'Global', description: 'Microsoft 365 online' },
  { name: 'SpaceX / Starlink', host: 'starlink.com', category: 'service', location: 'Hawthorne, CA', region: 'Americas', description: 'SpaceX Starlink ground internet' },
  { name: 'SpaceX', host: 'spacex.com', category: 'service', location: 'Hawthorne, CA', region: 'Americas', description: 'SpaceX web presence' },
  { name: 'AT&T', host: 'att.com', category: 'utility', location: 'Dallas, TX', region: 'Americas', description: 'AT&T carrier network' },
  { name: 'Hawaiian Electric', host: 'hawaiianelectric.com', category: 'utility', location: 'Honolulu, HI', region: 'Americas', description: 'Hawaiian Electric utilities' },
  { name: 'Amazon (AWS)', host: 'aws.amazon.com', category: 'service', location: 'Seattle, WA', region: 'Americas', description: 'Amazon Web Services' },
  { name: 'Amazon.com', host: 'amazon.com', category: 'service', location: 'Seattle, WA', region: 'Americas', description: 'Amazon e-commerce edge' },
  { name: 'Cloudflare', host: 'cloudflare.com', category: 'cdn', location: 'San Francisco, CA', region: 'Global', description: 'Cloudflare CDN / anycast' },
  { name: 'Akamai', host: 'akamai.com', category: 'cdn', location: 'Cambridge, MA', region: 'Global', description: 'Akamai CDN edge' },
  { name: 'Apple', host: 'apple.com', category: 'service', location: 'Cupertino, CA', region: 'Americas', description: 'Apple online services' },
  { name: 'Oracle Cloud', host: 'oracle.com', category: 'service', location: 'Austin, TX', region: 'Americas', description: 'Oracle cloud infrastructure' },
  { name: 'Netflix', host: 'netflix.com', category: 'service', location: 'Los Gatos, CA', region: 'Americas', description: 'Netflix streaming edge (Open Connect)' },
  { name: 'OpenDNS', host: '208.67.222.222', category: 'service', location: 'Global', region: 'Global', description: 'Cisco OpenDNS resolver' },
  { name: 'Quad9 DNS', host: '9.9.9.9', category: 'service', location: 'Global', region: 'Global', description: 'Quad9 security DNS' },
  { name: 'Cloudflare DNS', host: '1.1.1.1', category: 'service', location: 'Global', region: 'Global', description: 'Cloudflare anycast DNS' },

  /* ------------------------------ Major datacenters ------------------------------ */
  { name: 'Equinix ASH (Ashburn)', host: 'ix.equinix.com', category: 'datacenter', location: 'Ashburn, VA', region: 'Americas', description: 'Equinix Ashburn Internet Business Exchange' },
  { name: 'Digital Realty CHI', host: 'www.digitalrealty.com', category: 'datacenter', location: 'Chicago, IL', region: 'Americas', description: 'Digital Realty data center footprint' },
  { name: 'CoreSite LA1', host: 'www.coresite.com', category: 'datacenter', location: 'Los Angeles, CA', region: 'Americas', description: 'CoreSite One Wilshire carrier hotel' },
  { name: 'Equinix SY4 (Sydney)', host: 'www.equinix.com.au', category: 'datacenter', location: 'Sydney, NSW', region: 'Oceania', description: 'Equinix Sydney metro campus' },
  { name: 'Equinix TY (Tokyo)', host: 'www.equinix.com', category: 'datacenter', location: 'Tokyo', region: 'Asia', description: 'Equinix Tokyo metro campus' },
  { name: 'Equinix HK (Hong Kong)', host: 'www.equinix.com.hk', category: 'datacenter', location: 'Hong Kong', region: 'Asia', description: 'Equinix Hong Kong metro campus' },
  { name: 'Digital Realty SIN (Singapore)', host: 'www.digitalrealty.com', category: 'datacenter', location: 'Singapore', region: 'Asia', description: 'Digital Realty Singapore campus' },
  { name: 'ST Telemedia Global DC (Singapore)', host: 'www.sttelemediagdc.com', category: 'datacenter', location: 'Singapore', region: 'Asia', description: 'STT GDC Singapore' },
  { name: 'Interxion LON (London)', host: 'www.interxion.com', category: 'datacenter', location: 'London', region: 'Europe', description: 'Digital Realty / Interxion London campus' },
  { name: 'Equinix LD4 (London)', host: 'www.equinix.co.uk', category: 'datacenter', location: 'London', region: 'Europe', description: 'Equinix Slough / London campus' },
  { name: 'Equinix FR (Frankfurt)', host: 'www.equinix.de', category: 'datacenter', location: 'Frankfurt', region: 'Europe', description: 'Equinix Frankfurt campus' },
  { name: 'Interxion FRA (Frankfurt)', host: 'www.interxion.com', category: 'datacenter', location: 'Frankfurt', region: 'Europe', description: 'Interxion Frankfurt campus' },
  { name: 'OVHcloud GRA', host: 'www.ovhcloud.com', category: 'datacenter', location: 'Gravelines, FR', region: 'Europe', description: 'OVHcloud Gravelines DC' },
  { name: 'Telehouse Paris', host: 'www.telehouse.net', category: 'datacenter', location: 'Paris', region: 'Europe', description: 'Telehouse Paris carrier hotel' },
  { name: 'NTT Global Data Centers', host: 'www.ntt-globaldc.com', category: 'datacenter', location: 'Tokyo', region: 'Asia', description: 'NTT Global Data Centers' },
  { name: 'Ascenty SP (Sao Paulo)', host: 'www.ascenty.com', category: 'datacenter', location: 'Sao Paulo', region: 'South America', description: 'Ascenty Sao Paulo campus (Digital Realty)' },

  /* ---------------------------------- IXPs ---------------------------------- */
  { name: 'DE-CIX Frankfurt', host: 'www.de-cix.net', category: 'ixp', location: 'Frankfurt', region: 'Europe', description: 'DE-CIX — world\'s largest IXP' },
  { name: 'AMS-IX Amsterdam', host: 'ams-ix.net', category: 'ixp', location: 'Amsterdam', region: 'Europe', description: 'AMS-IX Amsterdam exchange' },
  { name: 'LINX London', host: 'www.linx.net', category: 'ixp', location: 'London', region: 'Europe', description: 'London Internet Exchange' },
  { name: 'Equinix IX (US)', host: 'www.equinix.com', category: 'ixp', location: 'Multiple (US)', region: 'Americas', description: 'Equinix Internet Exchanges' },
  { name: 'NYIIX New York', host: 'nyiix.net', category: 'ixp', location: 'New York, NY', region: 'Americas', description: 'New York International Internet Exchange' },
  { name: 'Equinix LAX IX', host: 'www.equinix.com', category: 'ixp', location: 'Los Angeles, CA', region: 'Americas', description: 'Equinix LA internet exchange' },
  { name: 'JPNAP Tokyo', host: 'www.jpnap.net', category: 'ixp', location: 'Tokyo', region: 'Asia', description: 'Japan Network Access Point' },
  { name: 'BBIX Tokyo', host: 'www.bbix.net', category: 'ixp', location: 'Tokyo', region: 'Asia', description: 'BBIX Tokyo internet exchange' },
  { name: 'HKIX Hong Kong', host: 'www.hkix.net', category: 'ixp', location: 'Hong Kong', region: 'Asia', description: 'Hong Kong Internet Exchange' },
  { name: 'SGIX Singapore', host: 'www.sgix.sg', category: 'ixp', location: 'Singapore', region: 'Asia', description: 'Singapore Internet Exchange' },
  { name: 'SIX Seattle', host: 'www.seattleix.net', category: 'ixp', location: 'Seattle, WA', region: 'Americas', description: 'Seattle Internet Exchange' },
  { name: 'NAP of the Americas', host: 'www.napoftheamericas.com', category: 'ixp', location: 'Miami, FL', region: 'Americas', description: 'NAP of the Americas (Equinix MI1)' },
  { name: 'PTTMetro Sao Paulo', host: 'www.ptt.br', category: 'ixp', location: 'Sao Paulo', region: 'South America', description: 'Brazil PTTMetro exchange' },
  { name: 'IX.br Sao Paulo', host: 'ix.br', category: 'ixp', location: 'Sao Paulo', region: 'South America', description: 'IX.br — largest exchange in LatAm' },
  { name: 'MCIX Miami', host: 'www.mcix.net', category: 'ixp', location: 'Miami, FL', region: 'Americas', description: 'Miami carrier-neutral exchange' },
  { name: 'Telx / Digital Realty NYIIX', host: 'nyiix.net', category: 'ixp', location: 'New York, NY', region: 'Americas', description: 'NYIIX interconnection points' },
  { name: 'Vienna Internet eXchange (VIX)', host: 'www.vix.at', category: 'ixp', location: 'Vienna', region: 'Europe', description: 'VIX Vienna exchange' },
  { name: 'France-IX Paris', host: 'www.franceix.net', category: 'ixp', location: 'Paris', region: 'Europe', description: 'France-IX Paris exchange' },
  { name: 'Milan Internet eXchange (MIX)', host: 'www.mix-it.net', category: 'ixp', location: 'Milan', region: 'Europe', description: 'MIX Milan exchange' },
];

export async function seedDestinations(): Promise<number> {
  const existing = await prisma.destination.count();
  if (existing > 0) return 0;

  let inserted = 0;
  for (const target of SEED_TARGETS) {
    try {
      await prisma.destination.create({ data: { ...target, enabled: true, createdBy: 'seed' } });
      inserted += 1;
    } catch (err) {
      // Skip duplicate hosts (e.g. same host reused for different labels)
      if ((err as { code?: string }).code !== 'P2002') {
        console.error(`[seed] failed to insert ${target.name}:`, (err as Error).message);
      }
    }
  }
  console.log(`[seed] inserted ${inserted} destinations`);
  return inserted;
}

/** Runs after seeding: populates ASN/company from RIR data in the background. */
export async function seedEnrichment(): Promise<void> {
  try {
    const { enrichAllDestinations } = await import('./enrich');
    const res = await enrichAllDestinations();
    console.log(`[seed] RIR enrichment done: ${res.enriched}/${res.total} attributed`);
  } catch (err) {
    console.error('[seed] RIR enrichment failed:', (err as Error).message);
  }
}
