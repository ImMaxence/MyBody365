package fr.mbonnici.mybody365.recipe;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** 1.19: how a meal said in words is cut into parts and read, without the database. */
class MealDescriptionTest {

    @Test
    void aMealIsCutIntoItsParts() {
        assertThat(MealDescription.parts("200 g de poulet, du riz et une pomme")).containsExactly("200 g de poulet", "du riz", "une pomme");
        assertThat(MealDescription.parts("Café avec du lait\n2 tartines + beurre ; confiture")).containsExactly("Café", "du lait", "2 tartines",
                "beurre", "confiture");
        assertThat(MealDescription.parts("  ")).isEmpty();
        assertThat(MealDescription.parts("a, b, c, d, e, f, g, h, i, j, k, l, m, n".replace(", ", " poulet, "))).hasSize(MealDescription.MAX_PARTS);
    }

    @Test
    void aNumberInWordsIsReadAsDigits() {
        assertThat(MealDescription.digits("une pomme")).isEqualTo("1 pomme");
        assertThat(MealDescription.digits("Deux œufs")).isEqualTo("2 œufs");
        assertThat(MealDescription.digits("une demi baguette")).isEqualTo("0.5 baguette");
        assertThat(MealDescription.digits("la moitié d'une pizza")).isEqualTo("0.5 une pizza");
        assertThat(MealDescription.digits("un quart de melon")).isEqualTo("0.25 melon");
        assertThat(MealDescription.digits("du riz")).isEqualTo("du riz");
        // the matcher then weighs the pieces
        assertThat(IngredientMatcher.parse(MealDescription.digits("une pomme")).grams()).isEqualTo(135.0);
        assertThat(IngredientMatcher.parse(MealDescription.digits("deux oeufs")).grams()).isEqualTo(100.0);
    }

    @Test
    void aPartWithoutAQuantityGetsThePortionOfAPlate() {
        assertThat(MealDescription.portion(IngredientMatcher.key("riz"), "pâtes, riz et céréales")).isEqualTo(160.0);
        assertThat(MealDescription.portion(IngredientMatcher.key("pâtes au pesto"), "plats composés")).isEqualTo(200.0);
        assertThat(MealDescription.portion(IngredientMatcher.key("blanquette"), "plats composés")).isEqualTo(300.0);
        assertThat(MealDescription.portion(IngredientMatcher.key("truc"), null)).isEqualTo(100.0);
        // the staples are taken cooked
        assertThat(MealDescription.EATEN.get(IngredientMatcher.key("pâtes"))).isEqualTo("9811");
        assertThat(MealDescription.EATEN.get(IngredientMatcher.key("pommes de terre"))).isEqualTo("4003");
    }
}
