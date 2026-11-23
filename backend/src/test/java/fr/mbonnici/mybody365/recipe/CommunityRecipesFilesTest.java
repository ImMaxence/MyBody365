package fr.mbonnici.mybody365.recipe;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/** The community’s recipes (resources/community): 200 in 1.7, 129 more in 1.9, 200 more in 1.10, 200 « Healthy » in 1.13, 7 chocolates and pastries in 1.18, 12 « Healthy » snacks and cakes in 1.20.4, plain scrambled eggs in 1.20.5, every one complete and within the API’s limits. */
class CommunityRecipesFilesTest {

    @Test
    void theFilesHoldTheirCompleteRecipes() throws Exception {
        List<CommunityRecipes.Seed> all = new ArrayList<>();
        for (Resource f : new PathMatchingResourcePatternResolver().getResources("classpath:community/*.txt")) {
            all.addAll(CommunityRecipes.parse(f.getContentAsString(StandardCharsets.UTF_8)));
        }
        assertThat(all).hasSize(749);
        // 1.13: the « Healthy » ones, put first on the recipes page
        assertThat(all.stream().filter(s -> s.types().contains(fr.mbonnici.mybody365.recipe.RecipeService.Type.HEALTHY)).count()).isEqualTo(213);
        Set<String> keys = new HashSet<>();
        for (CommunityRecipes.Seed s : all) {
            assertThat(keys.add(s.key())).as("one key per recipe: " + s.name()).isTrue();
            assertThat(s.key()).matches("[a-z0-9-]{3,140}");
            assertThat(s.name()).hasSizeLessThanOrEqualTo(120);
            assertThat(s.types()).as(s.name()).isNotEmpty().hasSizeLessThanOrEqualTo(6);
            assertThat(s.servings()).as(s.name()).isBetween(1, 50);
            assertThat(s.lines()).as(s.name()).hasSizeBetween(2, 60);
            assertThat(s.lines()).allSatisfy(l -> assertThat(l.grams()).isBetween(0.5, 10000.0));
            assertThat(s.steps()).as(s.name()).isNotEmpty();
            assertThat(String.join("\n", s.steps())).hasSizeLessThanOrEqualTo(4000).doesNotEndWith(".");
        }
        // what the French cook and like most is there
        assertThat(all).extracting(CommunityRecipes.Seed::name).contains("Bœuf bourguignon", "Blanquette de veau", "Couscous royal",
                "Quiche lorraine", "Gratin dauphinois", "Crêpes", "Mousse au chocolat", "Ratatouille");
        // 1.9: the everyday dishes, the pastries (« Plaisir ») and the drinks
        assertThat(all).extracting(CommunityRecipes.Seed::name).contains("Cordon bleu et pâtes", "Jambon-beurre", "Burger frites maison",
                "Steak haché purée", "Paris-Brest", "Éclairs au chocolat", "Mojito", "Virgin mojito");
        // 1.10: light dishes, the world, the regions of France, more breakfasts and drinks
        assertThat(all).extracting(CommunityRecipes.Seed::name).contains("Poulet, patate douce et brocoli", "Velouté de brocoli", "Butter chicken",
                "Poulet yassa", "Phở au bœuf", "Poule au pot", "Bouillabaisse", "Pancakes protéinés au fromage blanc", "Moscow mule", "Lassi à la mangue");
        // 1.18: the chocolates and pastries made at home that were missing
        assertThat(all).extracting(CommunityRecipes.Seed::name).contains("Mendiants au chocolat", "Orangettes", "Amandes enrobées de chocolat",
                "Macarons au chocolat", "Religieuses au chocolat");
        // 1.20.4: healthy snacks and cakes, the sugar of a compote, a ripe banana or a sweet potato
        assertThat(all).extracting(CommunityRecipes.Seed::name).contains("Granola maison healthy à la compote, sans sucre ajouté",
                "Cookies healthy à la compote de pomme", "Banana bread healthy sans sucre ajouté", "Tiramisu healthy au skyr",
                "Crackers aux graines, sans farine", "Œufs brouillés à l'huile d'olive");
        assertThat(all.stream().filter(s -> s.types().contains(RecipeService.Type.TREAT)).count()).isGreaterThanOrEqualTo(45);
        assertThat(all.stream().filter(s -> s.types().contains(RecipeService.Type.DRINK)).count()).isGreaterThanOrEqualTo(15);
    }

    /** 1.11: the photos of the community, one per recipe at most, each of a recipe of the files, under a free licence */
    @Test
    void thePhotosAreFreeAndForRecipesOfTheFiles() throws Exception {
        Set<String> keys = new HashSet<>();
        for (Resource f : new PathMatchingResourcePatternResolver().getResources("classpath:community/*.txt")) {
            CommunityRecipes.parse(f.getContentAsString(StandardCharsets.UTF_8)).forEach(s -> keys.add(s.key()));
        }
        List<CommunityImages.Pick> picks = CommunityImages.all();
        assertThat(picks).hasSizeGreaterThan(100);
        Set<String> seen = new HashSet<>();
        for (CommunityImages.Pick p : picks) {
            assertThat(keys).as("a recipe of the files: " + p.key()).contains(p.key());
            assertThat(seen.add(p.key())).as("one photo per recipe: " + p.key()).isTrue();
            assertThat(p.license()).as(p.key()).matches("(?i)(CC0|Public domain|CC BY(-SA)? \\d(\\.\\d)?( [a-z]+)?)");
            assertThat(p.url().getHost()).endsWith(".wikimedia.org");
            assertThat(p.author() == null ? "" : p.author()).hasSizeLessThanOrEqualTo(200);
        }
    }

    @Test
    void aMalformedLineIsRefused() {
        assertThatThrownBy(() -> CommunityRecipes.parse("= Soupe | LUNCH | 2\nbeaucoup de carottes\n")).hasMessageContaining("line 2");
        assertThatThrownBy(() -> CommunityRecipes.parse("20009 100 carottes\n")).hasMessageContaining("outside a recipe");
        assertThatThrownBy(() -> CommunityRecipes.parse("= Soupe | SOUPER | 2\n")).isInstanceOf(IllegalArgumentException.class);
        List<CommunityRecipes.Seed> one = CommunityRecipes.parse("# un commentaire\n= Crème brûlée | DESSERT,SNACK | 4\n19417 400 crème\n31016 70,5\n: Cuire\n");
        assertThat(one).singleElement().satisfies(s -> {
            assertThat(s.key()).isEqualTo("creme-brulee");
            assertThat(s.lines()).extracting(CommunityRecipes.Line::grams).containsExactly(400.0, 70.5);
            assertThat(s.steps()).containsExactly("Cuire");
        });
    }
}
