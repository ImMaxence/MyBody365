/** Public facts about the site, used by the landing, the legal pages and the meta tags. */
export const SITE = {
  url: 'https://mybody365.mbonnici.fr',
  host: 'mybody365.mbonnici.fr',
  owner: 'Maxence Bonnici',
  email: 'maxence.bonnici@outlook.fr',
  ownerSite: 'https://mbonnici.fr',
  contact: { fr: 'https://mbonnici.fr/fr/contact', en: 'https://mbonnici.fr/en/contact' },
  hosting: {
    fr: 'Serveur personnel auto-hébergé en France, exposé via Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA)',
    en: 'Self-hosted personal server in France, served through Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA)',
  },
  /** to move forward whenever the legal texts change */
  legalUpdated: '2026-11-18',
} as const;

export const LEGAL_DOCS = ['mentions', 'confidentialite', 'cgu'] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];
