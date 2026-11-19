package fr.mbonnici.mybody365;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import fr.mbonnici.mybody365.recipe.CommunityRecipes;
import fr.mbonnici.mybody365.user.AppUser;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

/**
 * 1.14: the team account is a bot (never changed, suspended nor deleted), the admins change the community's recipes in the
 * recipe editor and find them in Admin › Recettes, and a recipe sorted by a vitamin or a mineral.
 */
class CommunityAdminTest extends AbstractIntegrationTest {

    @Autowired
    private CommunityRecipes community;

    private AppUser lea;
    private AppUser admin;
    private UUID food;

    @BeforeEach
    void setUp() {
        wipe();
        jdbc.update("delete from community_seed");
        jdbc.update("delete from app_user where email = ?", CommunityRecipes.TEAM_EMAIL);
        jdbc.update("delete from food where source = 'CIQUAL' and source_code in ('91001', '91002')");
        lea = account("lea@example.com", AppUser.Role.USER);
        admin = account("admin@example.com", AppUser.Role.ADMIN);
        food = UUID.randomUUID();
        jdbc.update("""
                insert into food (id, source, source_code, name, search_name, category, kcal, protein_g, carbs_g, sugars_g, fat_g, sat_fat_g,
                  fiber_g, salt_g, micros) values (?, 'CIQUAL', '91001', 'Poivron rouge, cru', 'poivron rouge, cru', 'légumes', 30, 1, 5, 4, 0.3,
                  0.1, 2, 0.01, '{"c": 140, "a": 150}'::jsonb)""", food);
        jdbc.update("""
                insert into food (id, source, source_code, name, search_name, category, kcal, protein_g, carbs_g, sugars_g, fat_g, sat_fat_g,
                  fiber_g, salt_g, micros) values (?, 'CIQUAL', '91002', 'Riz blanc, cuit', 'riz blanc, cuit', 'céréales', 130, 2.5, 28, 0.1, 0.3,
                  0.1, 0.5, 0, '{"mg": 10, "c": 0}'::jsonb)""", UUID.randomUUID());
        community.seed(CommunityRecipes.parse("""
                = Poivrons farcis | LUNCH | 2
                91001 300 poivrons
                91002 150 riz
                : Farcir
                = Riz nature | LUNCH | 2
                91002 300 riz
                : Cuire
                """));
    }

    private String idOf(String name) {
        return jdbc.queryForObject("select id::text from recipe where name = ?", String.class, name);
    }

    @Test
    void theTeamIsABotNobodyChangesNorDeletes() throws Exception {
        UUID team = jdbc.queryForObject("select id from app_user where email = ?", UUID.class, CommunityRecipes.TEAM_EMAIL);
        mvc.perform(get("/api/admin/users").with(as(admin))).andExpect(status().isOk());
        mvc.perform(delete("/api/admin/users/" + team).with(as(admin)).with(csrf())).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("bot_account"));
        mvc.perform(patch("/api/admin/users/" + team).with(as(admin)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"SUSPENDED\"}")).andExpect(status().isForbidden());
        // nobody becomes a bot either
        mvc.perform(patch("/api/admin/users/" + lea.getId()).with(as(admin)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"BOT\"}")).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from app_user where email = ?", Integer.class, CommunityRecipes.TEAM_EMAIL)).isEqualTo(1);
    }

    @Test
    void anAdminChangesACommunityRecipeAMemberCannot() throws Exception {
        String id = idOf("Poivrons farcis");
        String body = """
                {"name": "Poivrons farcis au riz", "type": "LUNCH", "types": ["LUNCH", "DINNER"], "servings": 2, "notes": "Farcir puis cuire",
                 "visibility": "PUBLIC", "ingredients": [{"foodId": "%s", "grams": 400}]}""".formatted(food);
        mvc.perform(put("/api/me/recipes/" + id).with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body.replace("PUBLIC", "FRIENDS")))
                .andExpect(status().isNotFound());
        mvc.perform(put("/api/me/recipes/" + id).with(as(admin)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Poivrons farcis au riz"))
                .andExpect(jsonPath("$.mine").value(false));
        // still the team's, still in the community, and written in the admins' journal
        assertThat(jdbc.queryForObject("select u.email from recipe r join app_user u on u.id = r.owner_id where r.id = ?::uuid", String.class, id))
                .isEqualTo(CommunityRecipes.TEAM_EMAIL);
        mvc.perform(get("/api/recipes/community").param("q", "farcis").with(as(lea))).andExpect(jsonPath("$[0].name").value("Poivrons farcis au riz"));
        assertThat(jdbc.queryForObject("select count(*) from admin_audit where action = 'RECIPE_EDITED'", Integer.class)).isEqualTo(1);

        // a member's own recipe stays out of the admins' reach
        String mine = com.jayway.jsonpath.JsonPath.read(mvc.perform(post("/api/me/recipes").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body.replace("PUBLIC", "FRIENDS"))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(put("/api/me/recipes/" + mine).with(as(admin)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body.replace("PUBLIC", "FRIENDS")))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/me/recipes/" + mine).with(as(admin)).with(csrf())).andExpect(status().isNotFound());

        // an admin deletes a community recipe; it does not come back
        mvc.perform(delete("/api/me/recipes/" + idOf("Riz nature")).with(as(admin)).with(csrf())).andExpect(status().isNoContent());
        assertThat(community.seed(CommunityRecipes.parse("= Riz nature | LUNCH | 2\n91002 300 riz\n: Cuire\n"))).isZero();
    }

    @Test
    void theAdminsListTheCommunityByNameWithoutPhotoOrHidden() throws Exception {
        mvc.perform(get("/api/admin/recipes").with(as(lea))).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/recipes").with(as(admin))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.noPhoto").value(2)).andExpect(jsonPath("$.hidden").value(0))
                .andExpect(jsonPath("$.recipes[0].name").value("Poivrons farcis"));
        mvc.perform(post("/api/admin/recipes/" + idOf("Riz nature") + "/hide").with(as(admin)).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/admin/recipes").param("filter", "hidden").with(as(admin))).andExpect(jsonPath("$.hidden").value(1))
                .andExpect(jsonPath("$.recipes.length()").value(1)).andExpect(jsonPath("$.recipes[0].name").value("Riz nature"));
        mvc.perform(get("/api/admin/recipes").param("q", "poivron").with(as(admin))).andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void theCommunitySortsByAVitaminTheRichestServingsFirst() throws Exception {
        // the stuffed peppers bring vitamin C (300 g of peppers at 140 mg / 100 g, 2 servings), the plain rice none
        mvc.perform(get("/api/recipes/community").param("rich", "c").with(as(lea))).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Poivrons farcis"))
                .andExpect(jsonPath("$[0].micros.c").value(org.hamcrest.Matchers.closeTo(210, 1)));
        mvc.perform(get("/api/recipes/community").param("rich", "mg").with(as(lea))).andExpect(jsonPath("$[0].name").value("Riz nature"));
        // an unknown key sorts nothing out
        mvc.perform(get("/api/recipes/community").param("rich", "zz; drop").with(as(lea))).andExpect(jsonPath("$.length()").value(2));
    }
}
