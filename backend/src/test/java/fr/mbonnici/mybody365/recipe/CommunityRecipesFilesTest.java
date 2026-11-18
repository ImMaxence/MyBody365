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

/** The community's recipes (resources/community): 200 in 1.7, 129 more in 1.9, every one complete and within the API's limits. */
class CommunityRecipesFilesTest {

    @Test
    void theFilesHoldTheirCompleteRecipes() throws Exception {
        List<CommunityRecipes.Seed> all = new ArrayList<>();
        for (Resource f : new PathMatchingResourcePatternResolver().getResources("classpath:community/*.txt")) {
            all.addAll(CommunityRecipes.parse(f.getContentAsString(StandardCharsets.UTF_8)));
        }
        assertThat(all).hasSize(329);
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
        assertThat(all.stream().filter(s -> s.types().contains(RecipeService.Type.TREAT)).count()).isGreaterThanOrEqualTo(45);
        assertThat(all.stream().filter(s -> s.types().contains(RecipeService.Type.DRINK)).count()).isGreaterThanOrEqualTo(15);
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
