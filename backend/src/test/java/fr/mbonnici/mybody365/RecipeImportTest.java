package fr.mbonnici.mybody365;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.closeTo;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
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
}
