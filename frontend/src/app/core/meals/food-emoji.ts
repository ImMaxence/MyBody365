/**
 * 1.12: the emoji of a line of a meal without a picture: its recipe's type, its food's Ciqual category, a product, or a
 * plate for the rest (a quick portion). Categories are matched by their start, written as Ciqual writes them.
 */
const RECIPE: Record<string, string> = { BREAKFAST: '🥣', LUNCH: '🥗', DINNER: '🍲', SNACK: '🍎', DESSERT: '🍰', TREAT: '🧁', DRINK: '🍹' };

const CATEGORIES: [string, string][] = [
  ['glaces', '🍨'],
  ['sorbets', '🍨'],
  ['desserts glacés', '🍨'],
  ['eaux', '💧'],
  ['boisson alcoolisées', '🍷'],
  ['boissons', '🧃'],
  ['laits et boissons infantiles', '🍼'],
  ['légumineuses', '🫘'],
  ['légumes', '🥦'],
  ['fruits à coque', '🥜'],
  ['fruits', '🍎'],
  ['pommes de terre', '🥔'],
  ['herbes', '🌿'],
  ['épices', '🌶️'],
  ['pains', '🥖'],
  ['viennoiseries', '🥐'],
  ['viandes', '🥩'],
  ['autres produits à base de viande', '🥩'],
  ['charcuteries', '🥓'],
  ['poissons', '🐟'],
  ['produits à base de poissons', '🐟'],
  ['mollusques', '🦐'],
  ['huiles de poissons', '🐟'],
  ['oeufs', '🥚'],
  ['fromages', '🧀'],
  ['laits', '🥛'],
  ['produits laitiers', '🥛'],
  ['crèmes', '🥛'],
  ['beurres', '🧈'],
  ['margarines', '🧈'],
  ['huiles', '🫒'],
  ['autres matières grasses', '🫒'],
  ['pâtes, riz', '🍝'],
  ['farines', '🌾'],
  ['céréales de petit-déjeuner', '🥣'],
  ['céréales et biscuits infantiles', '🥣'],
  ['barres céréalières', '🍫'],
  ['biscuits apéritifs', '🥨'],
  ['biscuits', '🍪'],
  ['gâteaux', '🍰'],
  ['chocolats', '🍫'],
  ['confiseries', '🍬'],
  ['confitures', '🍯'],
  ['sucres', '🍯'],
  ['pizzas', '🍕'],
  ['sandwichs', '🥪'],
  ['soupes', '🍜'],
  ['salades composées', '🥗'],
  ['plats composés', '🍲'],
  ['feuilletées', '🥧'],
  ['pâtes à tarte', '🥧'],
  ['sauces', '🥫'],
  ['condiments', '🥫'],
  ['aides culinaires', '🥫'],
  ['sels', '🧂'],
  ['algues', '🥬'],
  ['ingrédients pour végétariens', '🌱'],
  ['tartinables végétariens', '🌱'],
];

export function groupEmoji(group?: string | null): string {
  if (!group) return '🍽️';
  if (RECIPE[group]) return RECIPE[group];
  if (group === 'PRODUCT') return '🛒';
  const g = group.toLowerCase();
  for (const [start, emoji] of CATEGORIES) if (g.startsWith(start)) return emoji;
  return '🍽️';
}
