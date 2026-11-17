package fr.mbonnici.mybody365;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import fr.mbonnici.mybody365.recipe.CommunityGuard;
import fr.mbonnici.mybody365.recipe.CommunityRecipes;
import fr.mbonnici.mybody365.user.AppUser;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** 1.7: the community's first recipes, written by the team, computed from Ciqual and added once. */
class CommunityRecipesTest extends AbstractIntegrationTest {

    @Autowired
    private CommunityRecipes community;

    @Autowired
    private CommunityGuard guard;

    @Autowired
    private fr.mbonnici.mybody365.auth.AccountLinkService links;

    @Autowired
    private fr.mbonnici.mybody365.user.AppUserRepository users;

    private AppUser lea;

    @BeforeEach
    void setUp() {
        wipe();
        jdbc.update("delete from community_seed");
        jdbc.update("delete from app_user where email = ?", CommunityRecipes.TEAM_EMAIL);
        jdbc.update("delete from food where source = 'CIQUAL' and source_code in ('90001', '90002', '90003')");
        lea = account("lea@example.com", AppUser.Role.USER);
    }

    private void ciqual(String code, String name, String category, double kcal, double sugars, double satFat, double salt) {
        jdbc.update("""
                insert into food (id, source, source_code, name, search_name, category, kcal, protein_g, carbs_g, sugars_g, fat_g, sat_fat_g,
                  fiber_g, salt_g) values (?, 'CIQUAL', ?, ?, ?, ?, ?, 1, 5, ?, 1, ?, 2, ?)""",
                UUID.randomUUID(), code, name, name.toLowerCase(), category, kcal, sugars, satFat, salt);
    }

    @Test
    void theTeamPublishesEachRecipeOnceWhenItsFoodsAreKnown() throws Exception {
        String text = """
                = Ratatouille | LUNCH,DINNER | 2
                90001 400 courgettes
                90002 20 huile d'olive
                : Faire revenir les courgettes
                : Laisser mijoter
                = Gâteau mystère | DESSERT | 4
                99999 100 un aliment absent de la table
                90003 50 sucre
                : Cuire
                """;
        // nothing yet: the foods are not there
        assertThat(community.seed(parse(text))).isZero();
        assertThat(jdbc.queryForObject("select count(*) from app_user where email = ?", Integer.class, CommunityRecipes.TEAM_EMAIL)).isZero();

        ciqual("90001", "Courgette, crue", "légumes", 17, 2, 0.1, 0.01);
        ciqual("90002", "Huile d'olive", "huiles et graisses végétales", 899, 0, 15, 0);
        ciqual("90003", "Sucre blanc", "sucres, miels et assimilés", 399, 99, 0, 0);
        assertThat(community.seed(parse(text))).isEqualTo(1);

        // in the community, by the team, computed from its foods, with its steps and both meals
        String list = mvc.perform(get("/api/recipes/community").with(as(lea))).andExpect(jsonPath("$[0].name").value("Ratatouille"))
                .andExpect(jsonPath("$[0].author").value("MyBody365"))
                .andExpect(jsonPath("$[0].types.length()").value(2))
                .andExpect(jsonPath("$[0].nutriscore").exists())
                .andReturn().getResponse().getContentAsString();
        String id = com.jayway.jsonpath.JsonPath.read(list, "$[0].id");
        mvc.perform(get("/api/recipes/" + id).with(as(lea)))
                // (400 g × 17 + 20 g × 899) / 100 / 2 servings
                .andExpect(jsonPath("$.perServing.kcal").value(org.hamcrest.Matchers.closeTo(123.9, 0.2)))
                .andExpect(jsonPath("$.notes").value("Faire revenir les courgettes\nLaisser mijoter"))
                .andExpect(jsonPath("$.ingredients[0].fruitVeg").value(true));
        // found by its name, without case nor accents
        mvc.perform(get("/api/recipes/community").param("q", "RATATOUÏLLE").with(as(lea))).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/recipes/community").param("q", "ratatouille gateau").with(as(lea))).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/recipes/community").param("q", "50%_").with(as(lea))).andExpect(jsonPath("$.length()").value(0));

        // the team is a plain member no one can sign in with, and its recipes stay in the community
        assertThat(jdbc.queryForObject("select role from app_user where email = ?", String.class, CommunityRecipes.TEAM_EMAIL)).isEqualTo("USER");
        assertThat(jdbc.queryForObject("select google_sub is null and not discoverable from app_user where email = ?", Boolean.class,
                CommunityRecipes.TEAM_EMAIL)).isTrue();
        assertThat(guard.run()).isZero();
        // no invitation nor recovery link for it, even asked by an admin (a « lost access » request in its name, say)
        AppUser team = users.findByEmail(CommunityRecipes.TEAM_EMAIL).orElseThrow();
        AppUser admin = account("admin@example.com", AppUser.Role.ADMIN);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> links.issue(team, fr.mbonnici.mybody365.auth.AccountLink.Kind.RECOVERY, admin.getId()))
                .hasMessageContaining("team_account");
        // an account made admin before 1.7.1 is a plain member again
        jdbc.update("update app_user set role = 'ADMIN' where email = ?", CommunityRecipes.TEAM_EMAIL);
        community.demoteTeam();
        assertThat(jdbc.queryForObject("select role from app_user where email = ?", String.class, CommunityRecipes.TEAM_EMAIL)).isEqualTo("USER");

        // once only, even after an admin deleted it
        assertThat(community.seed(parse(text))).isZero();
        jdbc.update("delete from recipe where id = ?", UUID.fromString(id));
        assertThat(community.seed(parse(text))).isZero();
        mvc.perform(get("/api/recipes/community").with(as(lea))).andExpect(jsonPath("$[*].name", not(hasItem("Ratatouille"))));
    }

    @Test
    void withoutTheirCiqualFoodsNothingIsAdded() throws Exception {
        // without the Ciqual table, nothing is added and nothing fails
        assertThat(community.run()).isZero();
    }

    private static java.util.List<CommunityRecipes.Seed> parse(String text) {
        return CommunityRecipes.parse(text);
    }
}
