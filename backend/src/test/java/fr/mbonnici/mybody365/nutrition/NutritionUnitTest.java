package fr.mbonnici.mybody365.nutrition;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class NutritionUnitTest {

    /** 1.20: a recipe is fried by its ingredients, its name only with enough fat to have soaked it up */
    @Test
    void ovenBakedNemsAreNotFried() {
        // nems of chicken, vegetables and rice paper, 2 g of olive oil for 849 g: baked
        assertThat(HealthScore.friedRecipe("Nems poulet légumes", false, 2, 849)).isFalse();
        // a fried chicken with 50 g of oil for 600 g, fries in a dish
        assertThat(HealthScore.friedRecipe("Poulet frit maison", false, 50, 600)).isTrue();
        assertThat(HealthScore.friedRecipe("Assiette du soir", true, 0, 500)).isTrue();
        assertThat(HealthScore.fat("huiles et graisses végétales", null, "Huile d'olive vierge extra")).isTrue();
        assertThat(HealthScore.fat(null, "Fats", "Lesieur")).isTrue();
        assertThat(HealthScore.fat(null, null, "Huile dolive")).isTrue();
        assertThat(HealthScore.fat("légumes", null, "Carotte, cuite à la vapeur")).isFalse();
    }

    /** 1.20.5: plain oat flakes are raw, not an industrial cereal; salt and spices have no score of their own */
    @Test
    void oatFlakesAreExcellentAndSaltHasNoScore() {
        Nutrients oats = new Nutrients(369, 10.6, 57.7, 1.04, 7.82, 1.37, 11.2, 0.011);
        HealthScore.Result flakes = HealthScore.score(HealthScore.of(FoodStore.Source.CIQUAL, "Flocons d'avoine", "céréales de petit-déjeuner", oats, null));
        assertThat(flakes.score()).isEqualTo(9);
        assertThat(flakes.cons()).doesNotContain("ultra");
        assertThat(flakes.pros()).contains("fiber", "raw");
        // a sweet cereal of the same group stays ultra-processed, a cheese is processed
        Nutrients choco = new Nutrients(390, 8.0, 75.0, 26.8, 4.5, 1.5, 6.1, 0.6);
        assertThat(HealthScore.score(HealthScore.of(FoodStore.Source.CIQUAL, "Céréales pour petit déjeuner chocolatées, non fourrées",
                "céréales de petit-déjeuner", choco, null)).cons()).contains("ultra");
        Nutrients comte = new Nutrients(409, 28.0, 0.5, 0.5, 33.0, 21.0, 0d, 0.8);
        assertThat(HealthScore.score(HealthScore.of(FoodStore.Source.CIQUAL, "Comté", "fromages et alternatives végétales", comte, null)).cons())
                .doesNotContain("ultra");
        Nutrients salt = new Nutrients(0, 0d, 0d, 0d, 0d, 0d, 0d, 99.8);
        assertThat(HealthScore.score(HealthScore.of(FoodStore.Source.CIQUAL, "Sel blanc alimentaire, iodé", "sels", salt, null))).isNull();
        assertThat(HealthScore.score(HealthScore.of(FoodStore.Source.CIQUAL, "Noix de muscade", "épices", new Nutrients(506, 6d, 28d, 28d, 36d, 26d, 21d, 0d),
                null))).isNull();
        assertThat(HealthScore.score(HealthScore.of(FoodStore.Source.CIQUAL, "Levure chimique ou poudre à lever", "aides culinaires",
                new Nutrients(108, 0d, 27d, 0d, 0d, 0d, 0d, 25d), null))).isNull();
        // the stock cube stays judged on its salt
        assertThat(HealthScore.score(HealthScore.of(FoodStore.Source.CIQUAL, "Bouillon de volaille, déshydraté", "aides culinaires",
                new Nutrients(250, 10d, 20d, 5d, 15d, 7d, 0d, 50d), null))).isNotNull();
    }

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

    /** 1.14: a vitamin known for a small part of a recipe only is unknown for the recipe, not « 0 % » */
    @Test
    void aVitaminKnownForAPinchOnlyIsUnknownForTheDish() {
        Micros.Mix stew = new Micros.Mix();
        // 600 g of beef (vitamin E unknown, B12 known), 10 g of parsley (vitamin E known)
        stew.add(java.util.Map.of("b12", 2.0), 600, 900);
        stew.add(java.util.Map.of("e", 0.8, "b12", 0.0), 10, 4);
        java.util.Map<String, Double> perServing = stew.known(1.0 / 4);
        assertThat(perServing).doesNotContainKey("e");
        assertThat(perServing.get("b12")).isEqualTo(3.0);
        // unknown values in the JSON are dropped, a negative one too
        assertThat(Micros.parse("{\"c\": 12.5, \"zz\": 3, \"fe\": -1}")).containsOnlyKeys("c");
        assertThat(Micros.json(java.util.Map.of())).isNull();
    }

    /** 1.17: everyday ingredients paired by hand: the coulis takes the purée's (scaled), the raw thai rice the raw white rice's */
    @Test
    void someEverydayIngredientsArePairedByHand() {
        java.util.UUID coulis = java.util.UUID.randomUUID();
        java.util.UUID thai = java.util.UUID.randomUUID();
        java.util.List<MicrosSiblings.Item> table = java.util.List.of(
                item(coulis, "Tomate, coulis, appertisé (purée de tomates mi-réduite à 11%)", "légumes", 45, 2, 7, java.util.Map.of()),
                item(java.util.UUID.randomUUID(), "Tomate, purée, appertisée", "légumes", 30, 1.5, 4.5, java.util.Map.of("c", 9.0, "fe", 0.6)),
                item(thai, "Riz thaï ou basmati, cru", "pâtes, riz et céréales", 350, 7.5, 78, java.util.Map.of()),
                item(java.util.UUID.randomUUID(), "Riz basmati, cuit, sans sel ajouté", "pâtes, riz et céréales", 140, 3, 31, java.util.Map.of("fe", 0.0)),
                item(java.util.UUID.randomUUID(), "Riz blanc, cru", "pâtes, riz et céréales", 350, 7, 77.5, java.util.Map.of("fe", 1.94)));
        java.util.Map<java.util.UUID, MicrosSiblings.Guess> guesses = MicrosSiblings.guess(table).stream()
                .collect(java.util.stream.Collectors.toMap(MicrosSiblings.Guess::id, g -> g));
        assertThat(guesses.get(coulis).from()).isEqualTo("Tomate, purée, appertisée");
        // more reduced: 9 g of protein + carbs against 6
        assertThat(guesses.get(coulis).micros().get("c")).isCloseTo(9.0 * 9 / 6, org.assertj.core.data.Offset.offset(0.001));
        assertThat(guesses.get(thai).from()).isEqualTo("Riz blanc, cru");
        assertThat(guesses.get(thai).micros().get("fe")).isEqualTo(1.94);
    }

    /** 1.15: a Ciqual food without vitamins takes those of its closest sibling, scaled; none when no food is close enough */
    @Test
    void aFoodWithoutVitaminsTakesThoseOfItsClosestSibling() {
        java.util.UUID raw = java.util.UUID.randomUUID();
        java.util.UUID samourai = java.util.UUID.randomUUID();
        java.util.UUID cereal = java.util.UUID.randomUUID();
        java.util.UUID leg = java.util.UUID.randomUUID();
        java.util.UUID sweet = java.util.UUID.randomUUID();
        java.util.List<MicrosSiblings.Item> table = java.util.List.of(
                item(raw, "Pâte à pizza, préemballée, crue", "pâtes à tarte", 240, 7, 45, java.util.Map.of()),
                item(java.util.UUID.randomUUID(), "Pâte à pizza, préemballée, cuite", "pâtes à tarte", 280, 8.5, 53, java.util.Map.of("fe", 2.0)),
                item(java.util.UUID.randomUUID(), "Riz blanc, cru", "pâtes, riz et céréales", 350, 7, 77.5, java.util.Map.of("mg", 25.0)),
                item(java.util.UUID.randomUUID(), "Riz blanc, cuit", "pâtes, riz et céréales", 155, 3.2, 33.2, java.util.Map.of("mg", 11.0)),
                item(samourai, "Sauce samouraï, préemballée", "sauces", 450, 1, 6, java.util.Map.of()),
                item(java.util.UUID.randomUUID(), "Sauce soja, préemballée", "sauces", 60, 6, 6, java.util.Map.of("k", 200.0)),
                item(cereal, "Céréales pour petit déjeuner au miel, non enrichies en vitamines et minéraux", "céréales", 380, 7, 85, java.util.Map.of()),
                item(java.util.UUID.randomUUID(), "Céréales pour petit déjeuner au miel, enrichies en vitamines et minéraux", "céréales", 380, 7, 85,
                        java.util.Map.of("b1", 1.0)),
                item(leg, "Agneau, gigot, cru", "viandes", 200, 19, 0, java.util.Map.of()),
                item(java.util.UUID.randomUUID(), "Foie, agneau, cru", "viandes", 140, 21, 2, java.util.Map.of("b12", 90.0)),
                item(sweet, "Fromage blanc, nature, 3% MG, sucré", "produits laitiers", 110, 7, 13, java.util.Map.of()),
                item(java.util.UUID.randomUUID(), "Fromage blanc, nature, 0% MG", "produits laitiers", 50, 8, 4, java.util.Map.of("ca", 120.0)));
        java.util.Map<java.util.UUID, MicrosSiblings.Guess> guesses = MicrosSiblings.guess(table).stream()
                .collect(java.util.stream.Collectors.toMap(MicrosSiblings.Guess::id, g -> g));
        assertThat(guesses.keySet()).containsExactlyInAnyOrder(raw, sweet);
        // the raw dough takes the baked one's, for its own water (52 g of protein + carbs against 61.5)
        assertThat(guesses.get(raw).from()).isEqualTo("Pâte à pizza, préemballée, cuite");
        assertThat(guesses.get(raw).micros().get("fe")).isCloseTo(2.0 * 52 / 61.5, org.assertj.core.data.Offset.offset(0.001));
        // added sugar is no calcium: taken as it is, not × 20/12
        assertThat(guesses.get(sweet).micros().get("ca")).isEqualTo(120.0);
        // a mayonnaise sauce is not a soy sauce, a plain cereal not an enriched one, a leg of lamb not its liver: unknown
        assertThat(guesses).doesNotContainKeys(samourai, cereal, leg);
        assertThat(MicrosSiblings.words("Pâtes sèches, aux œufs, crues")).containsExactly("pat", "sech", "oeuf", "cru");
        assertThat(MicrosSiblings.state("Pâte brisée, pur beurre, préemballée, crue")).isEqualTo(MicrosSiblings.State.RAW);
        assertThat(MicrosSiblings.state("Haricot flageolet, vert, sec")).isEqualTo(MicrosSiblings.State.DRIED);
        assertThat(MicrosSiblings.state("Soupe au cresson, déshydratée reconstituée")).isEqualTo(MicrosSiblings.State.COOKED);
        assertThat(MicrosSiblings.state("Mélange apéritif de graines salées et raisins secs")).isEqualTo(MicrosSiblings.State.UNSAID);
        assertThat(MicrosSiblings.enriched("Boisson au soja, nature, enrichie en calcium, préemballée")).isTrue();
        assertThat(MicrosSiblings.enriched("Boisson au soja, nature, non enrichie, préemballée")).isFalse();
    }

    private static MicrosSiblings.Item item(java.util.UUID id, String name, String category, double kcal, double protein, double carbs,
            java.util.Map<String, Double> micros) {
        return new MicrosSiblings.Item(id, name, category, new Nutrients(kcal, protein, carbs, 0d, 0d, 0d, 0d, 0d), micros);
    }
}
