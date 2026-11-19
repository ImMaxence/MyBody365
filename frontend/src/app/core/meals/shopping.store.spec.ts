import { AISLES, splitName } from './shopping.store';

describe('shopping list', () => {
  it('reads a long food name as what to look for, then its detail', () => {
    expect(splitName('Tomate, pelée, appertisée, au jus, non égouttée')).toEqual({ head: 'Tomate', rest: 'pelée, appertisée, au jus, non égouttée' });
    expect(splitName('Lait demi-écrémé (aliment moyen)')).toEqual({ head: 'Lait demi-écrémé', rest: '' });
    expect(splitName('Tomate sans précision, crue (aliment moyen)')).toEqual({ head: 'Tomate', rest: 'crue' });
    expect(splitName('Skyr nature · Siggi’s')).toEqual({ head: 'Skyr nature', rest: 'Siggi’s' });
    expect(splitName('Papier toilette')).toEqual({ head: 'Papier toilette', rest: '' });
  });

  it('walks the shop in order: fruits and vegetables first, the frozen food last', () => {
    expect(AISLES[0]).toBe('FRUITS_VEGETABLES');
    expect(AISLES.at(-2)).toBe('FROZEN');
    expect(AISLES.at(-1)).toBe('OTHER');
  });
});
