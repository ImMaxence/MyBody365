import { keys, lineInStep, scaleLine, stepIngredients } from './step-ingredients';

describe('the ingredients of a step (1.20.5)', () => {
  // the cookies with apple compote, as the Ciqual table names their foods
  const names = [
    "Flocons d'avoine",
    'Purée de pommes, type "compote sans sucres ajoutés", rayon ambiant',
    'Amande, émondée, sans sel ajouté',
    'Oeuf cru',
    'Chocolat noir 70 % de cacao environ, de dégustation, tablette',
    'Noix, cerneau, séchée',
    'Huile de colza',
    'Levure chimique ou poudre à lever',
    'Cannelle, poudre',
    'Pomme, chair et peau, crue',
  ];

  it('knows a food by its first word and its telling words', () => {
    expect(keys(names[1])).toEqual({ head: 'puree', others: ['pomme', 'compote'] });
    expect(keys(names[3]).head).toBe('oeuf');
  });

  it('finds what each step speaks of', () => {
    expect(stepIngredients("Mélanger la compote, l'œuf battu et l'huile", names)).toEqual([1, 3, 6]);
    expect(stepIngredients('Ajouter les flocons mixés et entiers, la poudre d’amande, la levure et la cannelle', names)).toEqual([0, 2, 7, 8]);
    expect(stepIngredients('Incorporer le chocolat et les noix concassés', names)).toEqual([4, 5]);
    // « la pomme » is the apple, not the purée of apples
    expect(stepIngredients('Ajouter la pomme coupée en petits dés', names)).toEqual([9]);
    expect(stepIngredients('Préchauffer le four à 180 °C', names)).toEqual([]);
  });

  it('reads the written lines and scales their amount', () => {
    expect(lineInStep('Faire griller le pain', '450 g de pain')).toBe(true);
    expect(lineInStep('Faire griller le pain', '160 g de crème fraîche')).toBe(false);
    expect(scaleLine('450 g de pain', 2)).toBe('900 g de pain');
    expect(scaleLine('1/2 citron', 2)).toBe('1 citron');
    expect(scaleLine('3 œufs', 0.5)).toBe('1,5 œufs');
    expect(scaleLine('sel, poivre', 2)).toBe('sel, poivre');
  });
});
