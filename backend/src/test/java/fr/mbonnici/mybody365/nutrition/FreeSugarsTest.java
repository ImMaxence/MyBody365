package fr.mbonnici.mybody365.nutrition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import fr.mbonnici.mybody365.nutrition.FoodStore.Source;
import org.junit.jupiter.api.Test;

/** 1.20: the free sugars of a food, from what it is (the tables give only the total sugars) */
class FreeSugarsTest {

    private static double ciqual(String category, String name, double sugars) {
        return FreeSugars.per100(Source.CIQUAL, category, name, null, sugars);
    }

    @Test
    void wholeFruitVegetablesAndPlainMilkHaveNone() {
        assertThat(ciqual("fruits", "Pomme, pulpe et peau, crue", 11.6)).isZero();
        assertThat(ciqual("fruits", "Abricot, dénoyauté, sec", 34.3)).isZero();
        assertThat(ciqual("légumes", "Carotte, crue", 6.6)).isZero();
        assertThat(ciqual("laits", "Lait demi-écrémé, pasteurisé", 4.8)).isCloseTo(0.1, within(0.01));
        assertThat(ciqual("produits laitiers frais et alternatives végétales", "Yaourt, lait entier, nature", 4.6)).isZero();
        assertThat(ciqual("boissons sans alcool", "Café, non instantané, sans sucres ajoutés, prêt à boire", 0)).isZero();
    }

    @Test
    void juicesSodasSweetsAndSyrupsAreAllFree() {
        assertThat(ciqual("boissons sans alcool", "Jus d'orange, frais", 8.4)).isEqualTo(8.4);
        assertThat(ciqual("boissons sans alcool", "Cola, sucré", 10.6)).isEqualTo(10.6);
        assertThat(ciqual("fruits", "Compote de pomme, préemballée", 22.6)).isEqualTo(22.6);
        assertThat(ciqual("fruits", "Abricot au sirop léger, appertisé, égoutté", 13.1)).isEqualTo(13.1);
        assertThat(ciqual("fruits", "Canneberge ou cranberry, séchée, sucrée", 72.8)).isEqualTo(72.8);
        assertThat(ciqual("biscuits sucrés", "Cookie aux pépites de chocolat", 35)).isEqualTo(35);
        assertThat(ciqual("sucres, miels et assimilés", "Miel", 81)).isEqualTo(81);
    }

    @Test
    void sweetenedDairyKeepsItsLactoseOutAndMixedDishesCountHalf() {
        assertThat(ciqual("produits laitiers frais et alternatives végétales", "Yaourt aux fruits, sucré", 13)).isCloseTo(8.3, within(0.01));
        assertThat(ciqual("boissons sans alcool", "Chocolat chaud, boisson instantanée, sucrée, prête à boire (reconstituée avec du lait demi-écrémé)",
                8.68)).isCloseTo(3.98, within(0.01));
        assertThat(ciqual("produits laitiers frais et alternatives végétales", "Dessert au soja, aromatisé, sucré", 10)).isEqualTo(10);
        assertThat(ciqual("plats composés", "Ratatouille cuisinée", 4)).isEqualTo(2);
    }

    @Test
    void productsByTheirGroupAndUnknownOnesByTheirName() {
        assertThat(FreeSugars.per100(Source.OFF, null, "Bonbons acidulés", "Sweets", 60)).isEqualTo(60);
        assertThat(FreeSugars.per100(Source.OFF, null, "Pommes Golden", "Fruits", 12)).isZero();
        assertThat(FreeSugars.per100(Source.OFF, null, "Thé glacé pêche, sucré", "Teas and herbal teas and coffees", 6)).isEqualTo(6);
        assertThat(FreeSugars.per100(Source.OFF, null, "Skyr nature", "Milk and yogurt", 3.5)).isZero();
        // no group: what the name says, else all of it (too much rather than too little)
        assertThat(FreeSugars.per100(Source.OFF, null, "Lentilles corail", null, 2)).isZero();
        assertThat(FreeSugars.per100(Source.OFF, null, "Super cookies", null, 30)).isEqualTo(30);
        assertThat(FreeSugars.per100(Source.USER, null, "Yaourt maison nature", null, 4.5)).isZero();
    }
}
