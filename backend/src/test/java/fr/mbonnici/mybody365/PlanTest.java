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

import com.jayway.jsonpath.JsonPath;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.AppUser;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** 1.20: the free sugars of a day (estimated from what each food is), and the meals planned for the days to come. */
class PlanTest extends AbstractIntegrationTest {

    private AppUser lea;
    private AppUser hugo;
    private final LocalDate today = TrackingService.today();

    @BeforeEach
    void setUp() throws Exception {
        wipe();
        jdbc.update("delete from food");
        lea = account("lea@example.com", AppUser.Role.USER);
        hugo = account("hugo@example.com", AppUser.Role.USER);
        json(put("/api/me/profile"), lea, """
                {"sex":"FEMALE","birthDate":"1996-04-12","heightCm":168,"activityLevel":"LIGHT",
                 "currentWeightKg":78.4,"goalWeightKg":68,"weeklyRateKg":0.5}""").andExpect(status().isOk());
    }

    private ResultActions json(MockHttpServletRequestBuilder req, AppUser who, String body) throws Exception {
        return mvc.perform(req.with(as(who)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private UUID food(String code, String name, String category, double kcal, double sugars) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into food (id, source, source_code, source_version, name, category, search_name, kcal, protein_g, carbs_g, sugars_g, fat_g)
                values (?, 'CIQUAL', ?, '2025_11_03', ?, ?, lower(?), ?, 1, ?, ?, 1)""", id, code, name, category, name, kcal, sugars, sugars);
        return id;
    }

    @Test
    void theFreeSugarsOfADayLeaveTheAppleOut() throws Exception {
        UUID apple = food("13039", "Pomme, pulpe et peau, crue", "fruits", 54, 11.6);
        UUID cola = food("18018", "Cola, sucré", "boissons sans alcool", 42, 10.6);
        json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"SNACK\",\"foodId\":\"" + apple + "\",\"grams\":200}")
                .andExpect(status().isCreated());
        String body = json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"LUNCH\",\"foodId\":\"" + cola + "\",\"grams\":330}")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        // 23.2 g of sugars in the apple, 35 g in the can: only the can's are free
        assertThat(((Number) JsonPath.read(body, "$.totals.sugarsG")).doubleValue()).isEqualTo(58.2);
        assertThat(((Number) JsonPath.read(body, "$.freeSugarsG")).doubleValue()).isEqualTo(35.0);
        // a quick portion counts all its sugars; a line made smaller, its free sugars with it
        String line = JsonPath.read(body, "$.entries[1].id");
        body = json(patch("/api/me/meals/" + line), lea, "{\"grams\":165}").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(((Number) JsonPath.read(body, "$.freeSugarsG")).doubleValue()).isEqualTo(17.5);
        body = json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"SNACK\",\"quick\":{\"name\":\"Bonbons\",\"kcal\":100,\"sugarsG\":20}}")
                .andReturn().getResponse().getContentAsString();
        assertThat(((Number) JsonPath.read(body, "$.freeSugarsG")).doubleValue()).isEqualTo(37.5);

        // the week: the free sugars, and the cola before the apple among their sources
        mvc.perform(get("/api/me/meals/stats").param("days", "7").with(as(lea))).andExpect(status().isOk())
                .andExpect(jsonPath("$.freeSugarsG").value(37.5))
                .andExpect(jsonPath("$.sugarSources[0].name").value("Bonbons"))
                .andExpect(jsonPath("$.sugarSources[1].name").value("Cola, sucré"))
                .andExpect(jsonPath("$.sugarSources.length()").value(2));
    }

    /** 1.20: oven-baked nems (a few grams of oil) are not « fried »; with a frying oil they are */
    @Test
    void nemsFromTheOvenAreNotFried() throws Exception {
        UUID chicken = food("36017", "Poulet, filet sans peau cru", "viandes crues", 110, 0);
        UUID paper = food("9999", "Galette de riz", "pâtes, riz et céréales", 337, 0);
        UUID oil = food("17270", "Huile d'olive vierge extra", "huiles et graisses végétales", 899, 0);
        String baked = JsonPath.read(json(post("/api/me/recipes"), lea, """
                {"name":"Nems poulet légumes","type":"DINNER","servings":10,"ingredients":[{"foodId":"%s","grams":200},{"foodId":"%s","grams":109},
                 {"foodId":"%s","grams":2}],"visibility":"PRIVATE"}""".formatted(chicken, paper, oil))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(get("/api/recipes/" + baked).with(as(lea))).andExpect(status().isOk())
                .andExpect(jsonPath("$.health.cons", org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("fried"))));
        String fried = JsonPath.read(json(post("/api/me/recipes"), lea, """
                {"name":"Nems frits","type":"DINNER","servings":10,"ingredients":[{"foodId":"%s","grams":200},{"foodId":"%s","grams":109},
                 {"foodId":"%s","grams":40}],"visibility":"PRIVATE"}""".formatted(chicken, paper, oil))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(get("/api/recipes/" + fried).with(as(lea))).andExpect(jsonPath("$.health.cons", org.hamcrest.Matchers.hasItem("fried")));
    }

    @Test
    void aWeekPlannedThenEatenAndOnTheShoppingList() throws Exception {
        UUID rice = food("9100", "Riz blanc, cru", "pâtes, riz et céréales", 350, 0.3);
        String recipe = JsonPath.read(json(post("/api/me/recipes"), lea, """
                {"name":"Riz sauté","type":"DINNER","servings":2,"ingredients":[{"foodId":"%s","grams":200}],"visibility":"PRIVATE"}"""
                .formatted(rice)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        LocalDate tomorrow = today.plusDays(1);

        String planned = json(post("/api/me/plan"), lea, "{\"day\":\"" + tomorrow + "\",\"slot\":\"DINNER\",\"recipeId\":\"" + recipe + "\",\"servings\":2}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.kind").value("RECIPE")).andExpect(jsonPath("$.name").value("Riz sauté"))
                .andExpect(jsonPath("$.kcal").value(700)).andReturn().getResponse().getContentAsString();
        json(post("/api/me/plan"), lea, "{\"day\":\"" + tomorrow + "\",\"slot\":\"LUNCH\",\"note\":\"  Restaurant   avec Hugo \"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("Restaurant avec Hugo"));
        // the lunch before the dinner, a day out of the range left out
        mvc.perform(get("/api/me/plan").param("from", today.toString()).param("to", today.plusDays(6).toString()).with(as(lea)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].kind").value("NOTE")).andExpect(jsonPath("$[1].servings").value(2.0));

        // not two things at once, not too far, not someone else's recipe or plan
        json(post("/api/me/plan"), lea, "{\"day\":\"" + tomorrow + "\",\"slot\":\"DINNER\",\"recipeId\":\"" + recipe + "\",\"note\":\"x\"}")
                .andExpect(status().isBadRequest());
        json(post("/api/me/plan"), lea, "{\"day\":\"" + today.plusDays(90) + "\",\"slot\":\"DINNER\",\"note\":\"Vacances\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("invalid_day"));
        json(post("/api/me/plan"), hugo, "{\"day\":\"" + tomorrow + "\",\"slot\":\"DINNER\",\"recipeId\":\"" + recipe + "\"}")
                .andExpect(status().isNotFound());
        String id = JsonPath.read(planned, "$.id");
        mvc.perform(delete("/api/me/plan/" + id).with(as(hugo)).with(csrf())).andExpect(status().isNotFound());

        // the week's recipes on the shopping list, for their servings
        json(post("/api/me/plan/shopping"), lea, "{\"from\":\"" + today + "\",\"to\":\"" + today.plusDays(6) + "\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].name").value("Riz blanc, cru"))
                .andExpect(jsonPath("$.items[0].grams").value(200.0));

        // eaten (the app notes it like any meal, a recipe made by hand too: no sugars known, none free), then off the plan
        String byHand = JsonPath.read(json(post("/api/me/recipes"), lea, """
                {"name":"Gratin","type":"DINNER","servings":2,"ingredients":[],"manual":{"kcal":450},"visibility":"PRIVATE"}""")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"DINNER\",\"recipeId\":\"" + byHand + "\",\"servings\":1.5}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.entries[0].kcal").doesNotExist())
                .andExpect(jsonPath("$.entries[0].nutrients.kcal").value(675.0));
        mvc.perform(delete("/api/me/plan/" + id).with(as(lea)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/me/plan").param("from", today.toString()).param("to", today.plusDays(6).toString()).with(as(lea)))
                .andExpect(jsonPath("$.length()").value(1));
        // a recipe deleted takes its plan with it
        json(post("/api/me/plan"), lea, "{\"day\":\"" + tomorrow + "\",\"slot\":\"DINNER\",\"recipeId\":\"" + recipe + "\"}").andExpect(status().isCreated());
        mvc.perform(delete("/api/me/recipes/" + recipe).with(as(lea)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/me/plan").param("from", today.toString()).param("to", today.plusDays(6).toString()).with(as(lea)))
                .andExpect(jsonPath("$.length()").value(1));
    }
}
