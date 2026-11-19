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
