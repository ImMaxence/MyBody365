package fr.mbonnici.mybody365.recipe;

import static org.assertj.core.api.Assertions.assertThat;

import fr.mbonnici.mybody365.recipe.IngredientMatcher.Candidate;
import fr.mbonnici.mybody365.recipe.IngredientMatcher.Parsed;
import java.util.List;
import org.junit.jupiter.api.Test;

/** An ingredient line as recipe sites write it → its weight and its Ciqual food (names of the 2025 table). */
class IngredientMatcherTest {

    private static final List<Candidate> TABLE = List.of(
            IngredientMatcher.candidate("9440", "Farine de blé tendre ou froment T45 (pour pâtisserie)", "farines"),
            IngredientMatcher.candidate("9999", "Farine de riz", "farines"),
            IngredientMatcher.candidate("9415", "Farine de blé tendre ou froment T150", "farines"),
            IngredientMatcher.candidate("20915", "Farine de soja complète", "farines"),
            IngredientMatcher.candidate("26039", "Thon, au naturel, appertisé, égoutté", "poissons"),
            IngredientMatcher.candidate("26179", "Thon germon ou thon blanc, à l'huile d'olive, appertisé", "poissons"),
            IngredientMatcher.candidate("16400", "Beurre à 80% MG minimum, doux", "beurres"),
            IngredientMatcher.candidate("31016", "Sucre blanc", "sucres"),
            IngredientMatcher.candidate("31017", "Sucre roux", "sucres"),
            IngredientMatcher.candidate("32121", "Pétales de maïs glacés au sucre, enrichis en vitamines et minéraux", "céréales"),
            IngredientMatcher.candidate("22000", "Oeuf cru", "oeufs"),
            IngredientMatcher.candidate("22002", "Jaune d'oeuf, cru", "oeufs"),
            IngredientMatcher.candidate("31085", "Chocolat noir 40% de cacao et plus, à pâtisser, tablette", "chocolats"),
            IngredientMatcher.candidate("28720", "Lardon fumé, cru", "charcuteries"),
            IngredientMatcher.candidate("19410", "Crème 30% MG, épaisse, rayon frais", "crèmes"),
            IngredientMatcher.candidate("19417", "Crème 30% MG, fluide, UHT", "crèmes"),
            IngredientMatcher.candidate("12775", "Mélange de fromages râpés (ex : spécial gratins, spécial pâtes, spécial pizzas…)", "fromages"),
            IngredientMatcher.candidate("19998", "Fromage blanc nature, 3% MG", "fromages blancs"),
            IngredientMatcher.candidate("4008", "Pomme de terre, sans peau, crue", "pommes de terre"),
            IngredientMatcher.candidate("13396", "Pomme, crue", "fruits"),
            IngredientMatcher.candidate("20145", "Courge spaghetti, chair sans peau, crue", "légumes"),
            IngredientMatcher.candidate("9810", "Pâtes sèches, standard, crues", "pâtes"),
            IngredientMatcher.candidate("20034", "Oignon, cru", "légumes"),
            IngredientMatcher.candidate("20035", "Oignon, cuit", "légumes"),
            IngredientMatcher.candidate("25001", "Oignon frit, en conserve", "plats composés"),
            IngredientMatcher.candidate("36007", "Poulet blanc, viande et peau crues", "volailles"),
            IngredientMatcher.candidate("36017", "Poulet, filet sans peau cru", "volailles"),
            IngredientMatcher.candidate("11000", "Ail, cru", "épices"),
            IngredientMatcher.candidate("17270", "Huile d'olive vierge extra", "huiles"),
            IngredientMatcher.candidate("11058", "Sel blanc alimentaire, iodé, non fluoré (marin, ignigène ou gemme)", "sels"));

    private static void parsed(String line, Double grams, String name) {
        Parsed p = IngredientMatcher.parse(line);
        assertThat(p.grams()).as(line).isEqualTo(grams);
        assertThat(p.name()).as(line).isEqualTo(name);
    }

    @Test
    void readsTheWeightOfEachLine() {
        // as les-creations-de-yona.fr writes them: the weight, the name, a remark in brackets
        parsed("180 g Chocolat noir (pour plus de gourmandises c'est mieux une tablette !)", 180.0, "Chocolat noir");
        parsed("80 g Blanc de poulet (( où jambon ))", 80.0, "Blanc de poulet");
        parsed("5 g Extrait vanille (Parfum : 1 sachet de sucre vanillé ou un trait (et 1 cuillère)", 5.0, "Extrait vanille");
        parsed("200g Farine", 200.0, "Farine");
        // and as the others do
        parsed("1,5 kg de farine", 1500.0, "farine");
        parsed("20 cl de crème liquide", 200.0, "crème liquide");
        parsed("1 c. à soupe d'huile d'olive", 15.0, "huile d'olive");
        parsed("2 cuillères à café de sucre", 10.0, "sucre");
        parsed("1 pincée de sel", 0.5, "sel");
        // pieces: what one usually weighs
        parsed("2 oeufs", 100.0, "oeufs");
        parsed("2 à 3 œufs", 125.0, "œufs");
        parsed("3 gousses d'ail", 15.0, "ail");
        parsed("2 blancs d'oeufs", 60.0, "blancs d'oeufs");
        parsed("1 oignon rouge", 90.0, "oignon rouge");
        parsed("½ citron", 60.0, "citron");
        parsed("500 g de pommes de terre", 500.0, "pommes de terre");
        // nothing to weigh
        parsed("Sel, poivre", null, "Sel");
        parsed("1 poulet fermier", null, "poulet fermier");
        // what a container holds
        parsed("1 boîte de thon", 140.0, "thon");
        parsed("1 boîte de pois chiches", 260.0, "pois chiches");
        parsed("1 filet d'huile d'olive", 5.0, "huile d'olive");
        parsed("2 filets de saumon", 280.0, "saumon");
        parsed("1 noix de beurre", 10.0, "beurre");
        parsed("1 poignée de roquette", 30.0, "roquette");
        parsed("1 botte de radis", 200.0, "radis");
        parsed("4 carrés de chocolat noir", 20.0, "chocolat noir");
        parsed("1 verre de lait", 200.0, "lait");
        parsed("2 pavés de saumon", 250.0, "pavés de saumon");
        // hazelnuts, not a knob of anything
        parsed("2 noisettes", null, "noisettes");
    }

    private static String food(String name) {
        Candidate c = IngredientMatcher.suggest(TABLE, name);
        return c == null ? null : c.code();
    }

    @Test
    void findsTheFoodItMostProbablyIs() {
        assertThat(food("Farine")).isEqualTo("9440");
        // wholemeal wheat flour, not soya flour
        assertThat(food("Farine complète")).isEqualTo("9415");
        // canned tuna in water, the usual one
        assertThat(food("thon")).isEqualTo("26039");
        assertThat(food("Beurre")).isEqualTo("16400");
        assertThat(food("Oeufs")).isEqualTo("22000");
        assertThat(food("Jaunes d'œufs")).isEqualTo("22002");
        assertThat(food("Chocolat noir")).isEqualTo("31085");
        assertThat(food("Sucre glace")).isEqualTo("31016");
        assertThat(food("Sucre cassonade")).isEqualTo("31017");
        assertThat(food("Creme frâiche")).isEqualTo("19410");
        assertThat(food("Lardons")).isEqualTo("28720");
        // the grated cheese, not a fromage blanc
        assertThat(food("Fromage rapé")).isEqualTo("12775");
        assertThat(food("pommes de terre")).isEqualTo("4008");
        assertThat(food("spaghetti")).isEqualTo("9810");
        // raw first, then cooked, a dish last
        assertThat(food("Oignon")).isEqualTo("20034");
        assertThat(food("Blanc de poulet")).isEqualTo("36017");
        assertThat(food("huile d'olive")).isEqualTo("17270");
        assertThat(food("Sel")).isEqualTo("11058");
        assertThat(food("quinoa")).isNull();
        assertThat(food("")).isNull();
    }
}
