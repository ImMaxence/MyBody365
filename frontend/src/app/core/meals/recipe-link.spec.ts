import { recipeLinkId } from './recipe-link';

describe('the recipe of a MyBody365 link (1.19)', () => {
  const id = '3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f';

  it('finds it in a link of the app, of the browser page, or in a message with words around it', () => {
    expect(recipeLinkId(`https://mybody365.mbonnici.fr/app/meals/recipes/${id}`)).toBe(id);
    expect(recipeLinkId(`https://mybody365.mbonnici.fr/app/meals/recipes/${id}?slot=LUNCH`)).toBe(id);
    expect(recipeLinkId(`Ma recette « Tarte fine » sur MyBody365 https://mybody365.mbonnici.fr/recette/${id.toUpperCase()}`)).toBe(id);
  });

  it('nothing in a search, another site or a cut id', () => {
    expect(recipeLinkId('tarte aux pommes')).toBeNull();
    expect(recipeLinkId('https://les-creations-de-yona.fr/recettes/tarte')).toBeNull();
    expect(recipeLinkId(`https://mybody365.mbonnici.fr/app/meals/recipes/${id.slice(0, 20)}`)).toBeNull();
    expect(recipeLinkId(null)).toBeNull();
  });
});
