package fr.mbonnici.mybody365.nutrition;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class NutritionUnitTest {

    @Test
    void nutriscoreOfWellKnownFoods() {
        // a hazelnut spread: very sweet and fatty
        assertThat(Nutriscore.grade(new Nutrients(539, 6.3, 57.5, 56.3, 30.9, 10.6, 0d, 0.107))).isEqualTo("e");
        // plain skyr
        assertThat(Nutriscore.grade(new Nutrients(63, 11d, 4d, 4d, 0.2, 0.1, 0d, 0.1))).isEqualTo("a");
        // raw apple: A as a fruit (100 % fruit), B if nothing tells it is one
        assertThat(Nutriscore.grade(new Nutrients(52, 0.25, 11.6, 9.35, 0d, 0d, 1.4, 0d), 100)).isEqualTo("a");
        assertThat(Nutriscore.grade(new Nutrients(52, 0.25, 11.6, 9.35, 0d, 0d, 1.4, 0d))).isEqualTo("b");
        // crisps
        assertThat(Nutriscore.grade(new Nutrients(536, 6.6, 50d, 0.6, 34d, 3.1, 4.4, 1.3))).isIn("c", "d");
        // unknown sugars: no grade
        assertThat(Nutriscore.grade(new Nutrients(143, 2.7, 31d, null, 0.3, 0.1, 0.4, 0d))).isNull();
        // a ratatouille: the same values, but 85 % vegetables (a recipe counts its share)
        Nutrients ratatouille = new Nutrients(80, 1.3, 6d, 4.5, 5.5, 0.8, 1.8, 0.7);
        assertThat(Nutriscore.grade(ratatouille)).isEqualTo("c");
        assertThat(Nutriscore.grade(ratatouille, 85)).isEqualTo("a");
        assertThat(Nutriscore.fruitVeg("légumes")).isTrue();
        assertThat(Nutriscore.fruitVeg("Légumineuses")).isTrue();
        assertThat(Nutriscore.fruitVeg("fruits à coque et graines oléagineuses")).isFalse();
        assertThat(Nutriscore.fruitVeg(null)).isFalse();
    }

    @Test
    void ciqualValues() {
        assertThat(CiqualParser.value(" 12,5 ")).isEqualTo(12.5);
        assertThat(CiqualParser.value("traces")).isZero();
        assertThat(CiqualParser.value("< 0,5")).isZero();
        assertThat(CiqualParser.value("-")).isNaN();
        assertThat(CiqualParser.value("")).isNaN();
    }

    @Test
    void searchText() {
        assertThat(SearchText.normalize("Pâte à TARTINER, Œufs")).isEqualTo("pate a tartiner oufs");
        assertThat(SearchText.words("  la pomme crue x ")).containsExactly("la", "pomme", "crue");
        assertThat(SearchText.contains("50%_off")).isEqualTo("%50\\%\\_off%");
    }
}
