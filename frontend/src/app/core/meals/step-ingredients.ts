/**
 * 1.20.5: the ingredients a step of a recipe speaks of, found by their names (« Écraser la banane avec la compote » →
 * the banana and the apple purée). An ingredient is known by the first word of its name (« Pomme, chair et peau » →
 * pomme, « Oeuf cru » → oeuf), and by its other telling words (« Purée de pommes, type "compote…" » → compote). A word
 * that is the first word of another ingredient belongs to that one: « la pomme » is the apple, not the purée.
 */

/** words that tell nothing of what a food is */
const STOP = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'au', 'aux', 'et', 'ou', 'en', 'un', 'une', 'sur', 'avec', 'sans', 'pour', 'par',
  'type', 'nature', 'cru', 'crue', 'cuit', 'cuite', 'frais', 'fraiche', 'sec', 'seche', 'entier', 'entiere', 'demi',
  'ecreme', 'ecremee', 'precuit', 'precuite', 'preemballe', 'preemballee', 'surgele', 'surgelee', 'appertise', 'appertisee',
  'egoutte', 'egouttee', 'moyen', 'aliment', 'rayon', 'ambiant', 'standard', 'classique', 'extra', 'vierge', 'raffine',
  'raffinee', 'poudre', 'grain', 'environ', 'ajoute', 'sucre', 'tendre', 'riche', 'source', 'specialite', 'preparation',
  'produit', 'base', 'facon', 'maison', 'tablette', 'degustation', 'patisser', 'soluble', 'instantane', 'alimentaire',
  'iode', 'fluore', 'marin', 'gemme', 'ignigene', 'chair', 'peau', 'pulpe', 'jus', 'filet', 'morceau', 'tranche',
  'noir', 'noire', 'blanc', 'blanche', 'rouge', 'vert', 'verte', 'jaune', 'brun', 'roux', 'doux', 'douce', 'fort',
]);
/** a stop word, its plural made singular too (« frais » read as « frai ») */
const isStop = (w: string) => STOP.has(w) || STOP.has(w + 's') || STOP.has(w + 'x');

/** a name or a step as plain words: lower case, no accents, singular */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w));
}

/** what an ingredient is known by: its first word, and the telling words of its name before the first comma (and in quotes) */
export function keys(name: string): { head: string; others: string[] } {
  const quoted = [...name.matchAll(/["«“]([^"»”]+)["»”]/g)].map((m) => m[1]).join(' ');
  const main = words(name.split(',')[0]);
  const head = main.find((w) => w.length >= 2 && !isStop(w)) ?? main[0] ?? '';
  const others = [...main, ...words(quoted)].filter((w) => w !== head && w.length >= 4 && !isStop(w) && !/^\d/.test(w));
  return { head, others: [...new Set(others)] };
}

/** the indexes of the ingredients a step speaks of, in the order of the list */
export function stepIngredients(step: string, names: string[]): number[] {
  const said = new Set(words(step));
  const all = names.map(keys);
  const heads = new Set(all.map((k) => k.head));
  return all
    .map((k, i) => ({ k, i }))
    .filter(({ k }) => said.has(k.head) || k.others.some((w) => said.has(w) && !heads.has(w)))
    .map(({ i }) => i);
}

/** a written line (« 450 g de pain ») whose telling words are in the step */
export function lineInStep(step: string, line: string): boolean {
  const said = new Set(words(step));
  return words(line).some((w) => w.length >= 4 && !isStop(w) && !/^\d/.test(w) && !UNITS.has(w) && said.has(w));
}

const UNITS = new Set(['gramme', 'kilo', 'litre', 'cuillere', 'cuilleree', 'soupe', 'verre', 'pincee', 'sachet', 'boite', 'botte', 'gousse']);

/** the first amount of a written line for other portions: « 450 g de pain » × 2 → « 900 g de pain » */
export function scaleLine(line: string, factor: number): string {
  if (factor === 1) return line;
  return line.replace(/^(\s*)(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?/, (all, space: string, n: string, d?: string) => {
    const v = (Number(n.replace(',', '.')) / (d ? Number(d) : 1)) * factor;
    const r = v >= 10 ? Math.round(v) : Math.round(v * 2) / 2;
    return space + String(r).replace('.', ',');
  });
}
