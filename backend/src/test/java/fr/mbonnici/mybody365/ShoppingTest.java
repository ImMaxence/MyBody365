package fr.mbonnici.mybody365;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import fr.mbonnici.mybody365.recipe.CommunityRecipes;
import fr.mbonnici.mybody365.user.AppUser;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

/** 1.11: the shopping list by aisle, « Que faire avec ce que j'ai ? » and the foods that may already exist. */
class ShoppingTest extends AbstractIntegrationTest {

    @Autowired
    private CommunityRecipes community;

    private AppUser lea;
    private AppUser hugo;
    private String ratatouille;
    private String omelette;

    @BeforeEach
    void setUp() {
        wipe();
        jdbc.update("delete from community_seed");
        jdbc.update("delete from app_user where email = ?", CommunityRecipes.TEAM_EMAIL);
        jdbc.update("delete from food where source = 'CIQUAL' and source_code like '91%'");
        lea = account("lea@example.com", AppUser.Role.USER);
        hugo = account("hugo@example.com", AppUser.Role.USER);
        ciqual("91001", "Courgette, crue", "légumes", 17);
        ciqual("91002", "Huile d'olive vierge extra", "huiles et graisses végétales", 899);
        ciqual("91003", "Oeuf cru", "oeufs", 140);
        ciqual("91004", "Lait demi-écrémé", "laits", 47);
        ciqual("91005", "Eau du robinet", "eaux", 0);
        ciqual("91006", "Poulet, filet sans peau cru", "viandes crues", 110);
        ciqual("91007", "Frites de pommes de terre, surgelées", "pommes de terre et autres tubercules", 142);
        ciqual("91008", "Tomate, pelée, appertisée", "légumes", 22);
        community.seed(CommunityRecipes.parse("""
                = Ratatouille légère | LUNCH,DINNER | 2
                91001 400 courgettes
                91008 200 tomates
                91002 20 huile
                91005 100 eau
                : Cuire
                = Omelette poulet courgette | LUNCH | 1
                91003 120 œufs (2)
                91006 100 poulet
                91001 100 courgette
                91004 30 lait
                91007 150 frites
                : Cuire
                """));
        ratatouille = jdbc.queryForObject("select recipe_id from community_seed where key = 'ratatouille-legere'", UUID.class).toString();
        omelette = jdbc.queryForObject("select recipe_id from community_seed where key = 'omelette-poulet-courgette'", UUID.class).toString();
    }

    private void ciqual(String code, String name, String category, double kcal) {
        jdbc.update("""
                insert into food (id, source, source_code, name, search_name, category, kcal) values (?, 'CIQUAL', ?, ?, ?, ?, ?)""",
                UUID.randomUUID(), code, name, fr.mbonnici.mybody365.nutrition.SearchText.normalize(name), category, kcal);
    }

    private String addRecipe(AppUser who, String id, int servings) throws Exception {
        return mvc.perform(post("/api/me/shopping/recipes").with(as(who)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"recipeId\":\"" + id + "\",\"servings\":" + servings + "}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    void theRecipesGoOnTheListAddedUpAndSortedByAisle() throws Exception {
        // the ratatouille for 4 (written for 2): twice the weights, no tap water
        addRecipe(lea, ratatouille, 4);
        String list = addRecipe(lea, omelette, 1);
        // fruits and vegetables first, the frozen food last; the courgettes of both recipes added up
        mvc.perform(get("/api/me/shopping").with(as(lea))).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].name", not(hasItem("Eau du robinet"))))
                .andExpect(jsonPath("$.items[0].name").value("Courgette, crue"))
                .andExpect(jsonPath("$.items[0].aisle").value("FRUITS_VEGETABLES"))
                .andExpect(jsonPath("$.items[0].grams").value(900.0))
                .andExpect(jsonPath("$.items[0].recipes").value("Ratatouille légère, Omelette poulet courgette"))
                .andExpect(jsonPath("$.items[-1:].aisle").value(contains("FROZEN")))
                .andExpect(jsonPath("$.items[?(@.name == 'Tomate, pelée, appertisée')].aisle").value(contains("SAVORY")))
                .andExpect(jsonPath("$.items[?(@.name == 'Oeuf cru')].pieces").value(contains(2)))
                .andExpect(jsonPath("$.items[?(@.name == 'Lait demi-écrémé')].unit").value(contains("ML")))
                .andExpect(jsonPath("$.items[?(@.name == 'Poulet, filet sans peau cru')].aisle").value(contains("BUTCHER")))
                .andExpect(jsonPath("$.recipes").value(containsInAnyOrder("Ratatouille légère", "Omelette poulet courgette")));
        assertThat((Integer) JsonPath.read(list, "$.items.length()")).isEqualTo(7);

        // lines typed by hand go where their words say, or under « Autres »
        mvc.perform(post("/api/me/shopping/items").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Papier toilette\"}")).andExpect(jsonPath("$.items[-1:].name").value(contains("Papier toilette")));
        String withYoghurts = mvc.perform(post("/api/me/shopping/items").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Yaourts nature\"}")).andReturn().getResponse().getContentAsString();
        assertThat((java.util.List<String>) JsonPath.read(withYoghurts, "$.items[?(@.name == 'Yaourts nature')].aisle")).containsExactly("DAIRY");

        // ticked in the basket, then the ticked ones taken off; nobody else touches the list
        String courgette = JsonPath.read(list, "$.items[0].id");
        mvc.perform(put("/api/me/shopping/items/" + courgette).with(as(hugo)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"checked\":true}")).andExpect(status().isNotFound());
        mvc.perform(put("/api/me/shopping/items/" + courgette).with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"checked\":true}")).andExpect(jsonPath("$.items[0].checked").value(true));
        mvc.perform(get("/api/me/shopping").with(as(hugo))).andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(delete("/api/me/shopping").param("checked", "true").with(as(lea)).with(csrf()))
                .andExpect(jsonPath("$.items[*].name", not(hasItem("Courgette, crue"))))
                .andExpect(jsonPath("$.items.length()").value(8));
        mvc.perform(delete("/api/me/shopping").with(as(lea)).with(csrf())).andExpect(jsonPath("$.items.length()").value(0));
        // a recipe one cannot see stays out
        jdbc.update("update recipe set hidden = true where id = ?::uuid", ratatouille);
        mvc.perform(post("/api/me/shopping/recipes").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"recipeId\":\"" + ratatouille + "\",\"servings\":2}")).andExpect(status().isNotFound());
    }

    @Test
    void whatToCookWithWhatIHave() throws Exception {
        // the ingredients one can choose, without what every kitchen has (oil, water)
        mvc.perform(get("/api/recipes/ingredients").with(as(lea))).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].key").value("courgette"))
                .andExpect(jsonPath("$[0].label").value("Courgette"))
                .andExpect(jsonPath("$[0].recipes").value(2))
                .andExpect(jsonPath("$[*].key", not(hasItem("huile"))))
                .andExpect(jsonPath("$[*].label", hasItem("Oeuf")));
        // courgettes and chicken: the omelette has both, the ratatouille one; what is missing is said (not the oil)
        mvc.perform(get("/api/recipes/with").param("k", "courgette").param("k", "poulet").with(as(lea))).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].recipe.name").value("Omelette poulet courgette"))
                .andExpect(jsonPath("$[0].have").value(2))
                .andExpect(jsonPath("$[1].recipe.name").value("Ratatouille légère"))
                .andExpect(jsonPath("$[1].have").value(1))
                .andExpect(jsonPath("$[1].missing").value(1))
                .andExpect(jsonPath("$[1].missingLabels[0]").value("Tomate"));
        mvc.perform(get("/api/recipes/with").with(as(lea))).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void aFoodAboutToBeCreatedThatAlreadyExistsIsPointedOut() throws Exception {
        String body = "{\"name\":\"%s\",\"kcal\":%s}";
        mvc.perform(post("/api/me/foods/lookalikes").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body.formatted("Courgettes", "18"))).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Courgette, crue"))
                .andExpect(jsonPath("$[0].source").value("CIQUAL"));
        // close words but very different calories: not the same food
        mvc.perform(post("/api/me/foods/lookalikes").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body.formatted("Poulet pané maison", "260"))).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(post("/api/me/foods/lookalikes").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body.formatted("Chocolat noir", "550"))).andExpect(jsonPath("$.length()").value(0));
        // one's own first
        mvc.perform(post("/api/me/foods").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Courgette du jardin\",\"kcal\":17}")).andExpect(status().isCreated());
        mvc.perform(post("/api/me/foods/lookalikes").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body.formatted("Courgette", "17")))
                .andExpect(jsonPath("$[0].name").value("Courgette du jardin")).andExpect(jsonPath("$[0].mine").value(true));
        // nobody else's
        mvc.perform(post("/api/me/foods/lookalikes").with(as(hugo)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body.formatted("Courgette", "17"))).andExpect(jsonPath("$[*].name", not(hasItem("Courgette du jardin"))));
    }
}
