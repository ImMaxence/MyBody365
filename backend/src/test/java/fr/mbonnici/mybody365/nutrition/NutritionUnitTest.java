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
        assertThat(HealthScore.fruitVegCategory("fruits à coque et graines oléagineuses")).isTrue();
        assertThat(Nutriscore.fruitVeg(null)).isFalse();
    }

    /** the same foods as the app's test (frontend core/meals/health.spec.ts): both sides must agree */
    @Test
    void healthScore() {
        // olive oil judged on its fat, butter on its saturated fat
        assertThat(score(new Nutrients(900, 0d, 0d, 0d, 100d, 14d, null, 0d), false, 2, null, false, null, false)).isEqualTo(8.5);
        assertThat(score(new Nutrients(745, 0.7, 0.6, 0.6, 82d, 54d, null, 0.04), false, 2, null, false, null, false)).isEqualTo(1.5);
        // industrial fries (an A on the Nutri-Score), sweet cereals, chicken, a hazelnut spread
        assertThat(score(new Nutrients(312, 3.4, null, 0.3, 15d, 2.3, 3.8, 0.5), false, 4, null, false, null, true)).isEqualTo(2.5);
        assertThat(score(new Nutrients(389, 9d, null, 23.5, 4.5, 2.1, 8.5, 0.2), false, 4, 1, false, null, false)).isEqualTo(3);
        assertThat(score(new Nutrients(150, 30d, null, 0d, 3d, 1d, 0d, 0.2), false, 1, null, false, null, false)).isEqualTo(9.5);
        assertThat(score(new Nutrients(539, 6.3, null, 56.3, 30.9, 10.6, 3.4, 0.1), false, 4, 2, false, null, false)).isEqualTo(0);
        // drinks against water: a cola, a cola with sweeteners
        assertThat(score(new Nutrients(42, null, null, 10.6, null, 0d, null, 0d), true, 4, null, false, null, false)).isEqualTo(0.5);
        assertThat(score(new Nutrients(0.2, null, null, 0d, null, 0d, null, 0.02), true, 4, 4, true, null, false)).isEqualTo(5.5);
        // nothing good said of a poor food, the claims kept to what is true
        HealthScore.Result spread = HealthScore.score(new HealthScore.Input(new Nutrients(539, 6.3, null, 56.3, 30.9, 10.6, 3.4, 0.1), false, false,
                false, 4, null, false, null, false));
        assertThat(spread.pros()).isEmpty();
        assertThat(spread.cons().getFirst()).isEqualTo("sugars");
        HealthScore.Result lentils = HealthScore.score(new HealthScore.Input(new Nutrients(116, 9d, null, 1d, 0.4, 0.1, 7.9, 0.01), false, false,
                false, null, null, false, 100d, false));
        assertThat(lentils.pros()).contains("fruitVeg", "fiber", "protein");
        // unknown sugars, alcohol: no score
        assertThat(HealthScore.score(new HealthScore.Input(new Nutrients(300, 10d, null, null, null, null, null, null), false, false, false, null,
                null, false, null, false))).isNull();
        assertThat(HealthScore.fried("Frites surgelées")).isTrue();
        assertThat(HealthScore.fried("Pain complet")).isFalse();

        // what a source tells: Ciqual's water, its plain vegetables (raw), an alcohol; a product's drink by its food group
        assertThat(HealthScore.of(FoodStore.Source.CIQUAL, "Eau minérale", "eaux", new Nutrients(0, 0d, 0d, 0d, 0d, 0d, 0d, 0d), null).water()).isTrue();
        HealthScore.Input carrot = HealthScore.of(FoodStore.Source.CIQUAL, "Carotte, crue", "légumes", new Nutrients(36, 0.8, 7d, 5d, 0.3, 0d, 2.7, 0.1), null);
        assertThat(carrot.nova()).isEqualTo(1);
        assertThat(carrot.fruitVeg()).isEqualTo(100d);
        assertThat(HealthScore.of(FoodStore.Source.CIQUAL, "Vin rouge", "boisson alcoolisées", new Nutrients(70, 0d, 0d, 0d, 0d, 0d, 0d, 0d), null).alcohol())
                .isTrue();
        ProductInfo soda = new ProductInfo("33 cl", null, "Sweetened beverages", 4, 2, false, null, 10);
        assertThat(HealthScore.of(FoodStore.Source.OFF, "Soda", null, new Nutrients(42, 0d, 10.6, 10.6, 0d, 0d, 0d, 0d), soda).drink()).isTrue();
        // in millilitres: a soda, a milk, a soup; an oil and a cream stay in grams
        assertThat(HealthScore.liquid(FoodStore.Source.OFF, "Soda", null, new Nutrients(42, 0d, 10.6, 10.6, 0d, 0d, 0d, 0d), soda)).isTrue();
        assertThat(HealthScore.liquid(FoodStore.Source.CIQUAL, "Lait demi-écrémé", "laits", new Nutrients(46, 3.2, 4.8, 4.8, 1.6, 1d, 0d, 0.1), null))
                .isTrue();
        ProductInfo oil = new ProductInfo("1 L", null, "Fats", 2, 0, false, null, 5);
        assertThat(HealthScore.liquid(FoodStore.Source.OFF, "Huile d'olive", null, new Nutrients(900, 0d, 0d, 0d, 100d, 14d, 0d, 0d), oil)).isFalse();
        assertThat(HealthScore.liquid(FoodStore.Source.OFF, "Biscuits", null, new Nutrients(480, 6d, 70d, 30d, 20d, 9d, 2d, 0.8),
                new ProductInfo("250 g", null, "Biscuits and cakes", 4, 3, false, null, 10))).isFalse();
        // sizes and sweeteners as the export writes them
        assertThat(ProductInfo.millilitres("6 x 33 cl")).isEqualTo(330);
        assertThat(ProductInfo.millilitres("1,5 L")).isEqualTo(1500);
        assertThat(ProductInfo.millilitres("500ml")).isEqualTo(500);
        assertThat(ProductInfo.millilitres("400 g")).isNull();
        assertThat(ProductInfo.sweeteners("en:e330,en:e951")).isTrue();
        assertThat(ProductInfo.sweeteners("en:e330,en:e150d")).isFalse();
        assertThat(HealthScore.fromGrade("B")).isEqualTo(7d);
    }

    private static Double score(Nutrients n, boolean drink, Integer nova, Integer additives, boolean sweeteners, Double fruitVeg, boolean fried) {
        HealthScore.Result r = HealthScore.score(new HealthScore.Input(n, drink, false, false, nova, additives, sweeteners, fruitVeg, fried));
        return r == null ? null : r.score();
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

    @Test
    void openFoodFactsLinesAreCleanedBeforeTheDatabase() {
        // a NUL, a tab, half an emoji: what PostgreSQL refuses goes, the rest stays
        assertThat(OffImporter.clean("Pain\u0000 de\tmie  ")).isEqualTo("Pain de mie");
        assertThat(OffImporter.clean("Biscuit \uD83C")).isEqualTo("Biscuit");
        assertThat(OffImporter.clean("Pomme 🍎")).isEqualTo("Pomme 🍎");
        assertThat(OffImporter.clean(null)).isNull();
        java.util.Map<String, Integer> col = java.util.Map.of("code", 0, "product_name", 1, "countries_tags", 2, "energy-kcal_100g", 3, "brands", 4);
        OffImporter.Row row = OffImporter.parse(new String[] {"3560070000001", "Kebab\u0000 maison", "en:france", "250", "Snack\u0000"}, col, "en:france");
        assertThat(row.name()).isEqualTo("Kebab maison");
        assertThat(row.brand()).isEqualTo("Snack");
        // a name made of control characters only: no product
        assertThat(OffImporter.parse(new String[] {"3560070000002", "\u0000\u0001", "en:france", "250", ""}, col, "en:france")).isNull();
        // an error says its reason, not the statement around it
        assertThat(OffImporter.cause(new RuntimeException("PreparedStatementCallback; SQL [insert…]",
                new IllegalStateException("ERROR: invalid byte sequence for encoding \"UTF8\": 0x00")))).startsWith("ERROR: invalid byte sequence");
    }

    /** 1.12: the picture of a product is a path of the images host only, and its date a plausible one */
    @org.junit.jupiter.api.Test
    void productPicturesStayOnTheImagesHost() {
        assertThat(OpenFoodFacts.imagePath("https://images.openfoodfacts.org/images/products/301/762/042/2003/front_fr.633.400.jpg"))
                .isEqualTo("301/762/042/2003/front_fr.633.400.jpg");
        assertThat(OpenFoodFacts.imagePath("https://static.openfoodfacts.org/images/products/20034412/front_fr.5.200.jpg"))
                .isEqualTo("20034412/front_fr.5.200.jpg");
        assertThat(OpenFoodFacts.imagePath("https://evil.example/images/products/301/front.jpg")).isNull();
        assertThat(OpenFoodFacts.imagePath("https://images.openfoodfacts.org/images/products/../../etc/passwd")).isNull();
        assertThat(OpenFoodFacts.imagePath("https://images.openfoodfacts.org/images/products/301/front.svg")).isNull();
        assertThat(OpenFoodFacts.epoch(1_700_000_000d)).isEqualTo(java.time.Instant.ofEpochSecond(1_700_000_000L));
        assertThat(OpenFoodFacts.epoch(12d)).isNull();
        assertThat(OpenFoodFacts.imageType(new byte[] {(byte) 0xff, (byte) 0xd8, (byte) 0xff, 0})).isEqualTo("image/jpeg");
        assertThat(OpenFoodFacts.imageType("<svg onload=x>".getBytes())).isNull();
        java.util.Map<String, Integer> col = java.util.Map.of("code", 0, "product_name", 1, "countries_tags", 2, "energy-kcal_100g", 3,
                "image_url", 4, "last_modified_t", 5);
        OffImporter.Row row = OffImporter.parse(new String[] {"3017620422003", "Pâte à tartiner", "en:france", "539",
                "https://images.openfoodfacts.org/images/products/301/762/042/2003/front_fr.633.400.jpg", "1731400000"}, col, "en:france");
        assertThat(row.imagePath()).isEqualTo("301/762/042/2003/front_fr.633.400.jpg");
        assertThat(row.modifiedAt()).isEqualTo(java.time.Instant.ofEpochSecond(1_731_400_000L));
    }
}
