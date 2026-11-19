package fr.mbonnici.mybody365.recipe;

import static org.assertj.core.api.Assertions.assertThat;

import fr.mbonnici.mybody365.recipe.RecipeLookalikes.Idf;
import fr.mbonnici.mybody365.recipe.RecipeLookalikes.Sketch;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** 1.10: what makes two recipes look alike, without the database. */
class RecipeLookalikesTest {

    @Test
    void anIngredientIsWhatItIsWhateverItsExactFood() {
        assertThat(RecipeLookalikes.key("Pâtes sèches, standard, crues")).isEqualTo("pate-seche");
        assertThat(RecipeLookalikes.key("Pâtes sèches, aux oeufs, crues")).isEqualTo("pate-seche");
        assertThat(RecipeLookalikes.key("Pomme de terre, sans peau, crue")).isEqualTo("pomme-terre");
        assertThat(RecipeLookalikes.key("Pomme, chair et peau, crue")).isEqualTo("pomme");
        assertThat(RecipeLookalikes.key("Crème 30% MG, fluide, UHT")).isEqualTo(RecipeLookalikes.key("Crème 12 à 20% MG, légère, fluide"));
        assertThat(RecipeLookalikes.key("Haricot vert, cru")).isNotEqualTo(RecipeLookalikes.key("Haricot rouge, appertisé, égoutté"));
        assertThat(RecipeLookalikes.key("Oeuf cru")).isEqualTo("oeuf");
        // a product of Open Food Facts, its brand left aside
        assertThat(RecipeLookalikes.key("Emmental râpé · Président")).isEqualTo("emmental");
        assertThat(RecipeLookalikes.words("Mes pâtes à la carbonara maison")).containsExactlyInAnyOrder("pate", "carbonara");
    }

    /** 1.11: how an ingredient reads in « Que faire avec ce que j'ai ? » */
    @Test
    void anIngredientReadsSimply() {
        assertThat(RecipeFinder.label("Crème 30% MG, fluide, UHT")).isEqualTo("Crème");
        assertThat(RecipeFinder.label("Emmental ou emmenthal, râpé")).isEqualTo("Emmental");
        assertThat(RecipeFinder.label("Oeuf cru")).isEqualTo("Oeuf");
        assertThat(RecipeFinder.label("Beurre à 80% MG minimum, doux")).isEqualTo("Beurre");
        assertThat(RecipeFinder.label("Tomate sans précision, crue (aliment moyen)")).isEqualTo("Tomate");
        assertThat(RecipeFinder.label("Pomme de terre, sans peau, crue")).isEqualTo("Pomme de terre");
        assertThat(RecipeFinder.label("Jambon cuit, choix")).isEqualTo("Jambon");
    }

    @Test
    void theSameDishIsFoundAndACakeIsNotAPancake() {
        Sketch carbonara = sketch("Pâtes à la carbonara", "Pâtes sèches, standard, crues", 400, "Lardon fumé, cru", 150, "Oeuf, jaune, cru", 80,
                "Parmesan", 50, "Poivre noir, poudre", 2);
        Sketch pancakes = sketch("Pancakes", "Farine de blé tendre T45", 250, "Lait demi-écrémé", 300, "Oeuf cru", 100, "Sucre blanc", 30,
                "Beurre doux", 30, "Levure chimique", 10);
        Sketch quiche = sketch("Quiche lorraine", "Pâte brisée, pur beurre", 230, "Lardon fumé, cru", 200, "Oeuf cru", 150,
                "Crème 30% MG, fluide", 200, "Lait demi-écrémé", 100);
        Sketch salad = sketch("Salade niçoise", "Laitue, crue", 100, "Tomate, crue", 200, "Thon, au naturel", 120, "Oeuf cru", 100,
                "Olive noire", 30);
        List<Sketch> all = List.of(carbonara, pancakes, quiche, salad);

        // another member's carbonara: other spaghetti, cream, more cheese, and another name
        Sketch mine = sketch("Spaghetti carbo", "Pâtes sèches, aux oeufs, crues", 250, "Lardon fumé, cru", 200, "Crème 12 à 20% MG", 100,
                "Parmesan", 80, "Oeuf cru", 60);
        Idf idf = new Idf(all, mine);
        assertThat(RecipeLookalikes.score(mine, carbonara, idf)).isGreaterThan(RecipeLookalikes.THRESHOLD);
        assertThat(RecipeLookalikes.score(mine, carbonara, idf)).isGreaterThan(RecipeLookalikes.score(mine, quiche, idf));
        assertThat(RecipeLookalikes.score(mine, salad, idf)).isZero();
        assertThat(RecipeLookalikes.score(mine, pancakes, idf)).isZero();

        // waffles: nearly the pancakes' batter, not a word in common: not shown
        Sketch waffles = sketch("Gaufres", "Farine de blé tendre T45", 250, "Lait demi-écrémé", 400, "Oeuf cru", 150, "Sucre blanc", 40,
                "Beurre doux", 100, "Levure chimique", 10);
        assertThat(RecipeLookalikes.score(waffles, pancakes, new Idf(all, waffles))).isZero();
        // « Mes pancakes »: the same batter, the same name
        Sketch myPancakes = sketch("Mes pancakes", "Farine de blé tendre T55", 200, "Lait demi-écrémé", 250, "Oeuf cru", 100, "Sucre blanc", 20,
                "Levure chimique", 8);
        assertThat(RecipeLookalikes.score(myPancakes, pancakes, new Idf(all, myPancakes))).isGreaterThan(0.7);
    }

    @Test
    void withoutIngredientsOnlyTheNameCounts() {
        Sketch carbonara = sketch("Pâtes à la carbonara", "Pâtes sèches, standard, crues", 400, "Lardon fumé, cru", 150);
        Sketch quiche = sketch("Quiche lorraine", "Pâte brisée, pur beurre", 230, "Lardon fumé, cru", 200);
        Sketch byHand = sketch("Pâtes carbonara");
        Idf idf = new Idf(List.of(carbonara, quiche), byHand);
        assertThat(RecipeLookalikes.score(byHand, carbonara, idf)).isGreaterThanOrEqualTo(RecipeLookalikes.SAME_NAME);
        assertThat(RecipeLookalikes.score(byHand, quiche, idf)).isZero();
        assertThat(RecipeLookalikes.score(sketch("Pâtes au saumon"), carbonara, idf)).isZero();
    }

    /** a name, then pairs of food name and grams */
    private static Sketch sketch(String name, Object... foods) {
        Map<String, Double> grams = new LinkedHashMap<>();
        for (int i = 0; i < foods.length; i += 2) {
            grams.merge(RecipeLookalikes.key((String) foods[i]), ((Number) foods[i + 1]).doubleValue(), Double::sum);
        }
        return new Sketch(UUID.randomUUID(), UUID.randomUUID(), true, name, RecipeLookalikes.words(name), RecipeLookalikes.shares(grams));
    }
}
