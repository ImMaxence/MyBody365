package fr.mbonnici.mybody365.shopping;

import static org.assertj.core.api.Assertions.assertThat;

import fr.mbonnici.mybody365.shopping.ShoppingService.Unit;
import org.junit.jupiter.api.Test;

/** 1.11: where a food is in the supermarket, and how it is counted on the list. */
class AisleTest {

    @Test
    void aCiqualFoodGoesToTheAisleOfItsCategory() {
        assertThat(Aisle.of("Carotte, crue", "légumes")).isEqualTo(Aisle.FRUITS_VEGETABLES);
        assertThat(Aisle.of("Persil, frais", "herbes")).isEqualTo(Aisle.FRUITS_VEGETABLES);
        assertThat(Aisle.of("Herbes de Provence, séchées", "herbes")).isEqualTo(Aisle.SAVORY);
        assertThat(Aisle.of("Pois chiche, appertisé, égoutté", "légumineuses")).isEqualTo(Aisle.SAVORY);
        assertThat(Aisle.of("Tomate, pelée, appertisée, au jus", "légumes")).isEqualTo(Aisle.SAVORY);
        assertThat(Aisle.of("Raisin sec", "fruits")).isEqualTo(Aisle.SWEET);
        assertThat(Aisle.of("Amande, avec peau", "fruits à coque et graines oléagineuses")).isEqualTo(Aisle.SAVORY);
        assertThat(Aisle.of("Pain blanc (par ex. : baguette, boule…)", "pains et assimilés")).isEqualTo(Aisle.BAKERY);
        assertThat(Aisle.of("Chapelure", "pains et assimilés")).isEqualTo(Aisle.SAVORY);
        assertThat(Aisle.of("Boeuf, steak haché 15% MG cru", "viandes crues")).isEqualTo(Aisle.BUTCHER);
        assertThat(Aisle.of("Saumon, élevage, cru", "poissons crus")).isEqualTo(Aisle.FISHMONGER);
        assertThat(Aisle.of("Thon, au naturel, appertisé, égoutté", "produits à base de poissons et produits de la mer")).isEqualTo(Aisle.SAVORY);
        assertThat(Aisle.of("Jambon cuit, choix", "charcuteries et alternatives végétales")).isEqualTo(Aisle.DELI);
        assertThat(Aisle.of("Emmental ou emmenthal, râpé", "fromages et alternatives végétales")).isEqualTo(Aisle.CHEESE);
        assertThat(Aisle.of("Pâte brisée, pur beurre, préemballée, crue", "pâtes à tarte")).isEqualTo(Aisle.DAIRY);
        assertThat(Aisle.of("Yaourt ou lait fermenté, nature", "produits laitiers frais et alternatives végétales")).isEqualTo(Aisle.DAIRY);
        assertThat(Aisle.of("Pâtes sèches, standard, crues", "pâtes, riz et céréales")).isEqualTo(Aisle.SAVORY);
        assertThat(Aisle.of("Chocolat noir 40% de cacao et plus, à pâtisser, tablette", "chocolats et produits à base de chocolat"))
                .isEqualTo(Aisle.SWEET);
        assertThat(Aisle.of("Rhum", "boisson alcoolisées")).isEqualTo(Aisle.DRINKS);
        assertThat(Aisle.of("Frites de pommes de terre, surgelées, préfrites", "pommes de terre et autres tubercules")).isEqualTo(Aisle.FROZEN);
        assertThat(Aisle.of("Glace ou crème glacée, en bac", "glaces")).isEqualTo(Aisle.FROZEN);
    }

    @Test
    void withoutCategoryTheWordsOfTheNameTell() {
        assertThat(Aisle.of("Skyr nature 0% · Siggi's", null)).isEqualTo(Aisle.DAIRY);
        assertThat(Aisle.of("Coca-Cola zéro", null)).isEqualTo(Aisle.DRINKS);
        assertThat(Aisle.of("Céréales chocolat", null)).isEqualTo(Aisle.SWEET);
        assertThat(Aisle.of("2 kg de pommes de terre", null)).isEqualTo(Aisle.FRUITS_VEGETABLES);
        assertThat(Aisle.of("Papier toilette", null)).isEqualTo(Aisle.OTHER);
    }

    @Test
    void eggsAreCountedAndLiquidsMeasured() {
        assertThat(ShoppingService.unit("Oeuf cru", "oeufs")).isEqualTo(Unit.PIECE);
        assertThat(ShoppingService.pieces("Oeuf cru", 300)).isEqualTo(5);
        assertThat(ShoppingService.pieces("Oeuf, jaune (jaune d'oeuf), cru", 40)).isEqualTo(2);
        assertThat(ShoppingService.unit("Lait demi-écrémé (aliment moyen)", "laits")).isEqualTo(Unit.ML);
        assertThat(ShoppingService.unit("Crème 30% MG, fluide, UHT", "crèmes et spécialités à base de crème")).isEqualTo(Unit.ML);
        assertThat(ShoppingService.unit("Crème 30% MG, épaisse, rayon frais", "crèmes et spécialités à base de crème")).isEqualTo(Unit.G);
        assertThat(ShoppingService.unit("Farine de blé tendre ou froment T45", "farines")).isEqualTo(Unit.G);
        assertThat(ShoppingService.withRecipe("Chili", "Ratatouille")).isEqualTo("Chili, Ratatouille");
        assertThat(ShoppingService.withRecipe("Chili, Ratatouille", "Chili")).isEqualTo("Chili, Ratatouille");
    }
}
