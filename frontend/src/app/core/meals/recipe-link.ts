/**
 * 1.19: the recipe a MyBody365 link points to (« https://…/app/meals/recipes/<id> », or the browser page « /recette/<id> »).
 * A link sent by message opens in the browser (an iPhone never opens the app of the home screen from a link): pasted in
 * a search of the app, it opens the recipe.
 */
const LINK = /\/(?:app\/meals\/recipes|recette)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-f-])/i;

export function recipeLinkId(text: string | null | undefined): string | null {
  const m = LINK.exec(text ?? '');
  return m ? m[1].toLowerCase() : null;
}
