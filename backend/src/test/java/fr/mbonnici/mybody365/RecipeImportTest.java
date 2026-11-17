package fr.mbonnici.mybody365;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.closeTo;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import fr.mbonnici.mybody365.nutrition.FoodStore;
import fr.mbonnici.mybody365.nutrition.Nutrients;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.AppUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** A recipe from a recipe site: read, checked by the member, saved with the calories they enter. */
class RecipeImportTest extends AbstractIntegrationTest {

    @Autowired
    CannedPages pages;

    private AppUser lea;
    private AppUser hugo;

    @BeforeEach
    void setUp() {
        wipe();
        lea = account("lea@example.com", AppUser.Role.USER);
        hugo = account("hugo@example.com", AppUser.Role.USER);
    }

    private ResultActions json(MockHttpServletRequestBuilder req, AppUser who, String body) throws Exception {
        return mvc.perform(req.with(as(who)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void aRecipeSiteGivesADraftThenARecipeWithTheCaloriesEnteredByHand() throws Exception {
        // the draft: the site's recipe data, the fragment never sent
        json(post("/api/me/recipes/import"), lea, "{\"url\":\"https://recettes.example/bruschetta#recipe\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Bruschetta"))
                .andExpect(jsonPath("$.type").value("SNACK"))
                .andExpect(jsonPath("$.servings").value(14))
                .andExpect(jsonPath("$.ingredients.length()").value(3))
                .andExpect(jsonPath("$.ingredients[0]").value("450 g Pain (soit 1,5 pain coupé en tranches)"))
                .andExpect(jsonPath("$.instructions").value("Préparation\n1. Couper le pain en tranches.\n2. Faire griller & garnir."))
                .andExpect(jsonPath("$.kcal").value(212.0))
                .andExpect(jsonPath("$.proteinG").value(7.0))
                .andExpect(jsonPath("$.sourceName").value("recettes.example"));
        assertThat(pages.fetched.getLast().toString()).isEqualTo("https://recettes.example/bruschetta");

        json(post("/api/me/recipes/import"), lea, "{\"url\":\"https://blog.example/\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("recipe_not_found"));
        json(post("/api/me/recipes/import"), lea, "{\"url\":\"file:///etc/passwd\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("recipe_url_invalid"));
        json(post("/api/me/recipes/import"), lea, "{\"url\":\"pas un lien\"}").andExpect(status().isBadRequest());
        // a whole message pasted: its first https link
        json(post("/api/me/recipes/import"), lea,
                "{\"url\":\"Regarde http://blog.example/ puis https://recettes.example/bruschetta, trop bon !\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Bruschetta"));
        assertThat(pages.fetched.getLast().toString()).isEqualTo("https://recettes.example/bruschetta");

        // saved with the calories the member entered: no ingredient from the database
        String id = JsonPath.read(json(post("/api/me/recipes"), lea, """
                {"name":"Bruschetta","type":"SNACK","servings":14,"notes":"1. Couper le pain","visibility":"FRIENDS","ingredients":[],
                 "manual":{"kcal":215,"proteinG":7},"ingredientLines":["450 g Pain","160 g Crème fraîche","  "],
                 "sourceUrl":"https://www.recettes.example/bruschetta"}""")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.manualNutrition").value(true))
                .andExpect(jsonPath("$.perServing.kcal").value(215.0))
                .andExpect(jsonPath("$.ingredientLines.length()").value(2))
                .andExpect(jsonPath("$.sourceName").value("recettes.example"))
                .andExpect(jsonPath("$.nutriscore").doesNotExist())
                .andReturn().getResponse().getContentAsString(), "$.id");
        json(post("/api/me/recipes"), lea, """
                {"name":"Sans calories","type":"SNACK","servings":2,"ingredients":[],"manual":{"kcal":0}}""").andExpect(status().isBadRequest());
        json(post("/api/me/recipes"), lea, """
                {"name":"Lien bizarre","type":"SNACK","servings":2,"ingredients":[],"manual":{"kcal":100},"sourceUrl":"javascript:alert(1)"}""")
                .andExpect(status().isBadRequest());

        // two servings at lunch: 430 kcal
        json(post("/api/me/meals"), lea, "{\"day\":\"" + TrackingService.today() + "\",\"slot\":\"LUNCH\",\"recipeId\":\"" + id
                + "\",\"servings\":2}").andExpect(status().isCreated()).andExpect(jsonPath("$.totals.kcal").value(closeTo(430, 0.1)));

        // a copy keeps the lines and the source
        mvc.perform(get("/api/recipes/" + id).with(as(lea))).andExpect(jsonPath("$.ingredientLines[1]").value("160 g Crème fraîche"));
        mvc.perform(post("/api/recipes/" + id + "/copy").with(as(hugo)).with(csrf())).andExpect(status().isNotFound()); // not friends
    }

    @Autowired
    FoodStore foodStore;

    private void ciqual(String code, String name, double kcal, double protein, double carbs, double sugars, double fat, double satFat,
            double fiber, double salt) {
        foodStore.insert(FoodStore.Source.CIQUAL, code, "2025_11_03", null, name, null, null, "test",
                new Nutrients(kcal, protein, carbs, sugars, fat, satFat, fiber, salt), null, false, null);
    }

    @Test
    void aRecipeOfLesCreationsDeYonaComesWithItsFoodsItsPhotoAndItsParts() throws Exception {
        ciqual("9440", "Farine de blé tendre ou froment T45 (pour pâtisserie)", 343, 10, 72, 1, 1, 0.2, 3, 0);
        ciqual("9999", "Farine de riz", 360, 6, 80, 0.1, 1, 0.3, 2, 0);
        ciqual("16400", "Beurre à 80% MG minimum, doux", 745, 0.7, 0.8, 0.8, 82, 55, 0, 0.02);
        ciqual("22000", "Oeuf cru", 140, 12.7, 0.3, 0.3, 9.8, 2.6, 0, 0.3);
        ciqual("31016", "Sucre blanc", 400, 0, 100, 100, 0, 0, 0, 0);
        ciqual("11058", "Sel blanc alimentaire, iodé, non fluoré (marin, ignigène ou gemme)", 0, 0, 0, 0, 0, 0, 0, 99.8);
        ciqual("19410", "Crème 30% MG, épaisse, rayon frais", 292, 2.3, 3.1, 3, 30, 20, 0, 0.1);

        String draft = json(post("/api/me/recipes/import"), lea,
                "{\"url\":\"https://les-creations-de-yona.fr/recettes/tartes/tarte-normande\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Tarte Normande"))
                .andExpect(jsonPath("$.type").value("DESSERT"))
                .andExpect(jsonPath("$.servings").value(8))
                // each part counts its steps, as on the site
                .andExpect(jsonPath("$.instructions").value("La pâte\n1. Sablez la farine et le beurre.\n2. Ajoutez l'œuf, puis filmez.\n\n"
                        + "La garniture\n1. Fouettez la crème et le sucre."))
                // the site gives the whole recipe's values: per serving here
                .andExpect(jsonPath("$.kcal").value(300.0))
                .andExpect(jsonPath("$.fatG").value(15.0))
                .andExpect(jsonPath("$.proteinG").value(6.0))
                // each line with its food and its weight
                .andExpect(jsonPath("$.matches.length()").value(7))
                .andExpect(jsonPath("$.matches[0].food.name").value("Farine de blé tendre ou froment T45 (pour pâtisserie)"))
                .andExpect(jsonPath("$.matches[0].grams").value(200.0))
                .andExpect(jsonPath("$.matches[1].food.name").value("Beurre à 80% MG minimum, doux"))
                .andExpect(jsonPath("$.matches[2].food.name").value("Oeuf cru"))
                .andExpect(jsonPath("$.matches[2].grams").value(100.0))
                .andExpect(jsonPath("$.matches[4].grams").value(2.0))
                .andExpect(jsonPath("$.matches[5].food.name").value("Crème 30% MG, épaisse, rayon frais"))
                .andExpect(jsonPath("$.matches[6].line").value("Calvados (facultatif)"))
                .andExpect(jsonPath("$.matches[6].food").doesNotExist())
                // the creator's own site: its photo comes along
                .andExpect(jsonPath("$.photo").value(org.hamcrest.Matchers.startsWith("data:image/webp;base64,UklGR")))
                .andExpect(jsonPath("$.sourceName").value("les-creations-de-yona.fr"))
                .andReturn().getResponse().getContentAsString();
        assertThat(pages.fetched.getLast().toString()).isEqualTo("https://les-creations-de-yona.fr/api/images/4599/1600.webp");
        // the line no food was found for, kept for the admins (the tables to complete), nobody's name with it
        AppUser admin = account("admin@example.com", AppUser.Role.ADMIN);
        mvc.perform(get("/api/admin/foods/misses").with(as(admin))).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.key == 'calvado')].reason").value(org.hamcrest.Matchers.hasItem("FOOD")))
                .andExpect(jsonPath("$[?(@.key == 'calvado')].example").value(org.hamcrest.Matchers.hasItem("Calvados (facultatif)")));
        mvc.perform(get("/api/admin/foods/misses").with(as(lea))).andExpect(status().isForbidden());
        mvc.perform(delete("/api/admin/foods/misses").param("key", "calvado").with(as(admin)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/admin/foods/misses").with(as(admin))).andExpect(jsonPath("$[?(@.key == 'calvado')]").isEmpty());

        // saved with its foods: calories and Nutri-Score computed like any recipe
        StringBuilder ingredients = new StringBuilder();
        for (int i = 0; i < 6; i++) {
            if (i > 0) {
                ingredients.append(',');
            }
            ingredients.append("{\"foodId\":\"").append((String) JsonPath.read(draft, "$.matches[" + i + "].food.id")).append("\",\"grams\":")
                    .append((Double) JsonPath.read(draft, "$.matches[" + i + "].grams")).append('}');
        }
        json(post("/api/me/recipes"), lea, """
                {"name":"Tarte Normande","type":"DESSERT","servings":8,"ingredients":[%s],
                 "sourceUrl":"https://les-creations-de-yona.fr/recettes/tartes/tarte-normande"}""".formatted(ingredients))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.manualNutrition").value(false))
                .andExpect(jsonPath("$.perServing.kcal").value(closeTo(262.9, 1)))
                .andExpect(jsonPath("$.nutriscore").exists())
                .andExpect(jsonPath("$.sourceName").value("les-creations-de-yona.fr"));

        // any other site's photo stays there
        json(post("/api/me/recipes/import"), lea, "{\"url\":\"https://recettes.example/bruschetta\"}")
                .andExpect(jsonPath("$.photo").doesNotExist())
                .andExpect(jsonPath("$.matches[0].food").doesNotExist());
        assertThat(pages.fetched.getLast().toString()).isEqualTo("https://recettes.example/bruschetta");
    }
}
