package fr.mbonnici.mybody365.recipe;

import static org.assertj.core.api.Assertions.assertThat;

import fr.mbonnici.mybody365.recipe.PlateWeight.Line;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 1.18: what a cooked serving weighs, from the raw ingredients of a recipe (the names and groups of the Ciqual table). */
class PlateWeightTest {

    private static Line l(String name, String category, double grams) {
        return new Line(name, category, grams);
    }

    @Test
    void dryPastaTakesInItsWaterAndTheMeatLosesSome() {
        List<Line> lines = List.of(l("Pâtes sèches, standard, crues", "pâtes, riz et céréales", 400), l("Boeuf, steak haché 15% MG, cru", "viandes crues", 400),
                l("Sauce tomate, préemballée", "sauces", 400), l("Oignon, cru", "légumes", 100));
        // 400 × 2.3 + 400 × 0.72 + 400 + 100 × 0.88 = 1696 g, for 4
        assertThat(PlateWeight.perServing("Spaghetti bolognaise", lines, 4)).isEqualTo(420.0);
    }

    @Test
    void theWaterListedForTheRiceIsTheWaterItTakesIn() {
        List<Line> lines = List.of(l("Riz blanc, cru", "pâtes, riz et céréales", 300), l("Eau du robinet", "eaux", 480));
        // the 480 g of water are what 300 g of rice take in: 780 g of cooked rice, nothing more
        assertThat(PlateWeight.perServing("Riz pilaf", lines, 3)).isEqualTo(260.0);
    }

    @Test
    void aSoupKeepsItsWaterAStewReducesIt() {
        List<Line> soup = List.of(l("Carotte, crue", "légumes", 500), l("Eau du robinet", "eaux", 1000));
        List<Line> stew = List.of(l("Boeuf, paleron, cru", "viandes crues", 1000), l("Vin rouge", "boisson alcoolisées", 750));
        assertThat(PlateWeight.perServing("Soupe de carottes", soup, 4)).isEqualTo(340.0);
        assertThat(PlateWeight.perServing("Bœuf bourguignon", stew, 4)).isEqualTo(280.0);
    }

    @Test
    void aSaladIsEatenAsItIsWeighedAndACakeLosesSomeInTheOven() {
        List<Line> salad = List.of(l("Tomate, crue", "légumes", 300), l("Thon, cru", "poissons crus", 100));
        assertThat(PlateWeight.perServing("Salade de thon", salad, 2)).isEqualTo(200.0);
        List<Line> cake = List.of(l("Farine de blé tendre ou froment T55", "farines", 250), l("Sucre blanc", "sucres, miels et assimilés", 150),
                l("Oeuf, cru", "oeufs", 150), l("Lait demi-écrémé, UHT", "laits", 100));
        // 650 g of batter, −12 % in the oven, in 8
        assertThat(PlateWeight.perServing("Gâteau au yaourt", cake, 8)).isEqualTo(70.0);
    }

    @Test
    void nothingIsSaidWithoutIngredients() {
        assertThat(PlateWeight.perServing("Une recette", List.of(), 4)).isNull();
    }
}
