package fr.mbonnici.mybody365;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.closeTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.AppUser;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;

/** Foods from three sources, meals of the day, recipes and the community. */
class MealsTest extends AbstractIntegrationTest {

    private AppUser lea;
    private AppUser hugo;
    private AppUser admin;
    private final LocalDate today = TrackingService.today();

    @BeforeEach
    void setUp() throws Exception {
        wipe();
        jdbc.update("delete from food");
        jdbc.update("delete from ciqual_import");
        FakeOpenData.ciqualVersion = "2025_11_03";
        lea = account("lea@example.com", AppUser.Role.USER);
        hugo = account("hugo@example.com", AppUser.Role.USER);
        admin = account("admin@example.com", AppUser.Role.ADMIN);
        mvc.perform(put("/api/me/profile").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
                {"sex":"FEMALE","birthDate":"1996-04-12","heightCm":168,"activityLevel":"LIGHT",
                 "currentWeightKg":78.4,"goalWeightKg":68,"weeklyRateKg":0.5}""")).andExpect(status().isOk());
    }

    private String importCiqual() throws Exception {
        String body = mvc.perform(post("/api/admin/foods/ciqual/import").with(as(admin)).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RUNNING")).andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");
        for (int i = 0; i < 100; i++) {
            String s = mvc.perform(get("/api/admin/foods/ciqual/imports/" + id).with(as(admin))).andReturn().getResponse()
                    .getContentAsString();
            String state = JsonPath.read(s, "$.status");
            if (!"RUNNING".equals(state)) {
                return s;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("the import did not finish");
    }

    private ResultActions json(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req, AppUser who, String body)
            throws Exception {
        return mvc.perform(req.with(as(who)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private String search(AppUser who, String q, String source) throws Exception {
        return mvc.perform(get("/api/foods/search").param("q", q).param("source", source).with(as(who))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    void ciqualIsImportedThenUpdatedWithoutLosingTheOldTable() throws Exception {
        mvc.perform(post("/api/admin/foods/ciqual/import").with(as(lea)).with(csrf())).andExpect(status().isForbidden());

        String done = importCiqual();
        assertThat((String) JsonPath.read(done, "$.status")).isEqualTo("DONE");
        assertThat((Integer) JsonPath.read(done, "$.foods")).isEqualTo(3); // the food without energy is left out
        assertThat((String) JsonPath.read(done, "$.version")).isEqualTo("2025_11_03");

        String found = search(lea, "pomme", "local");
        assertThat((String) JsonPath.read(found, "$[0].name")).isEqualTo("Pomme, crue");
        assertThat((String) JsonPath.read(found, "$[0].source")).isEqualTo("CIQUAL");
        assertThat((String) JsonPath.read(found, "$[0].category")).isEqualTo("fruits");
        assertThat((Double) JsonPath.read(found, "$[0].per100.kcal")).isEqualTo(52.1);
        assertThat((Double) JsonPath.read(found, "$[0].per100.fatG")).isEqualTo(0.0); // "traces"
        assertThat((String) JsonPath.read(found, "$[0].nutriscore")).isEqualTo("a");
        // accents and case do not matter; drinks get no general Nutri-Score
        assertThat(search(lea, "EAU minerale", "local")).contains("Eau minérale").doesNotContain("\"nutriscore\"");

        // same table again: nothing to do
        assertThat((String) JsonPath.read(importCiqual(), "$.status")).isEqualTo("UP_TO_DATE");

        // a new table: its foods replace the old ones in searches, the old ones stay
        FakeOpenData.ciqualVersion = "2026_05_04";
        assertThat((String) JsonPath.read(importCiqual(), "$.status")).isEqualTo("DONE");
        mvc.perform(get("/api/admin/foods").with(as(admin)))
                .andExpect(jsonPath("$.ciqualVersion").value("2026_05_04"))
                .andExpect(jsonPath("$.ciqualFoods").value(3))
                .andExpect(jsonPath("$.supersededFoods").value(3))
                .andExpect(jsonPath("$.imports.length()").value(3));
        assertThat((Integer) JsonPath.read(search(lea, "riz", "local"), "$.length()")).isEqualTo(1);
    }

    @Test
    void openFoodFactsByBarcodeAndBySearch() throws Exception {
        mvc.perform(get("/api/foods/barcode/3017620422003").with(as(lea))).andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("OFF"))
                .andExpect(jsonPath("$.brand").value("Marque Test"))
                .andExpect(jsonPath("$.nutriscore").value("e"))
                .andExpect(jsonPath("$.servingG").value(15.0));
        mvc.perform(get("/api/foods/barcode/0000000000000").with(as(lea))).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("food_not_found"));
        mvc.perform(get("/api/foods/barcode/abc").with(as(lea))).andExpect(status().isBadRequest());

        String off = search(lea, "skyr", "off");
        assertThat((Integer) JsonPath.read(off, "$.length()")).isEqualTo(2); // the product without energy is skipped
        assertThat(off).contains("Isey");
        // the Nutri-Score is estimated when Open Food Facts has none
        assertThat((Boolean) JsonPath.read(off, "$[1].nutriscoreEstimated")).isTrue();
        // now known locally, for everybody
        assertThat((Integer) JsonPath.read(search(hugo, "skyr vanille", "local"), "$.length()")).isEqualTo(1);
    }

    @Test
    void ownFoodsArePrivate() throws Exception {
        String created = json(post("/api/me/foods"), lea, """
                {"name":"Galette de mamie","brand":"Maison","kcal":320,"proteinG":7,"carbsG":40,"sugarsG":2,"fatG":14,"satFatG":5,
                 "fiberG":2,"saltG":1.1,"servingG":120}""").andExpect(status().isCreated()).andExpect(jsonPath("$.mine").value(true))
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(created, "$.id");
        assertThat(search(lea, "galette mamie", "local")).contains(id);
        assertThat(search(hugo, "galette mamie", "local")).doesNotContain(id);
        mvc.perform(get("/api/foods/" + id).with(as(hugo))).andExpect(status().isNotFound());
        json(post("/api/me/meals"), hugo, "{\"day\":\"" + today + "\",\"slot\":\"LUNCH\",\"foodId\":\"" + id + "\"}")
                .andExpect(status().isNotFound());
        json(put("/api/me/foods/" + id), hugo, "{\"name\":\"x\",\"kcal\":1}").andExpect(status().isNotFound());
        json(post("/api/me/foods"), lea, "{\"name\":\"\",\"kcal\":2000}").andExpect(status().isBadRequest());
    }

    @Test
    void mealsOfTheDay() throws Exception {
        String food = JsonPath.read(mvc.perform(get("/api/foods/barcode/3017620422003").with(as(lea))).andReturn().getResponse()
                .getContentAsString(), "$.id");
        // 15 g by default (the product's portion)
        json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"BREAKFAST\",\"foodId\":\"" + food + "\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.entries[0].grams").value(15.0))
                .andExpect(jsonPath("$.totals.kcal").value(closeTo(80.9, 0.1)))
                .andExpect(jsonPath("$.targetKcal").isNumber());
        String day = json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"SNACK\",\"foodId\":\"" + food + "\",\"grams\":30}")
                .andExpect(jsonPath("$.totals.kcal").value(closeTo(242.6, 0.2)))
                .andReturn().getResponse().getContentAsString();
        String snack = JsonPath.read(day, "$.entries[1].id");
        // a new amount scales the line
        json(patch("/api/me/meals/" + snack), lea, "{\"grams\":60}")
                .andExpect(jsonPath("$.entries[1].nutrients.kcal").value(closeTo(323.4, 0.1)));
        // yesterday's breakfast, copied to tomorrow
        json(post("/api/me/meals/copy"), lea, "{\"fromDay\":\"" + today + "\",\"toDay\":\"" + today.plusDays(1) + "\",\"slot\":\"BREAKFAST\"}")
                .andExpect(jsonPath("$.entries.length()").value(1));
        mvc.perform(get("/api/me/meals/recent").with(as(lea))).andExpect(jsonPath("$[0].name").value("Pâte à tartiner noisettes"));
        // somebody else's line is out of reach
        mvc.perform(delete("/api/me/meals/" + snack).with(as(hugo)).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(delete("/api/me/meals/" + snack).with(as(lea)).with(csrf())).andExpect(jsonPath("$.entries.length()").value(1));
        json(post("/api/me/meals"), lea, "{\"day\":\"" + today.plusDays(10) + "\",\"slot\":\"LUNCH\",\"foodId\":\"" + food + "\"}")
                .andExpect(status().isBadRequest());
    }

    @Test
    void aQuickPortionWithOnlyItsCalories() throws Exception {
        // a fast-food menu: its name and its calories, nothing else needed
        json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"LUNCH\",\"quick\":{\"name\":\" Menu burger frites \",\"kcal\":1080,\"proteinG\":40}}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.entries[0].name").value("Menu burger frites"))
                .andExpect(jsonPath("$.entries[0].servings").value(1.0))
                .andExpect(jsonPath("$.totals.kcal").value(1080.0));
        String id = JsonPath.read(mvc.perform(get("/api/me/meals").param("day", today.toString()).with(as(lea))).andReturn().getResponse()
                .getContentAsString(), "$.entries[0].id");
        // two of them: the calories follow
        json(patch("/api/me/meals/" + id), lea, "{\"servings\":2}").andExpect(jsonPath("$.totals.kcal").value(2160.0));
        // offered again from the recents, as one portion
        mvc.perform(get("/api/me/meals/recent").with(as(lea)))
                .andExpect(jsonPath("$[0].kind").value("QUICK"))
                .andExpect(jsonPath("$[0].name").value("Menu burger frites"))
                .andExpect(jsonPath("$[0].kcal").value(1080.0))
                .andExpect(jsonPath("$[0].quick.proteinG").value(40.0));
        json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"LUNCH\",\"quick\":{\"name\":\"Rien\",\"kcal\":0}}")
                .andExpect(status().isBadRequest());
        json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"LUNCH\",\"quick\":{\"name\":\"\",\"kcal\":300}}")
                .andExpect(status().isBadRequest());
        String food = JsonPath.read(mvc.perform(get("/api/foods/barcode/3017620422003").with(as(lea))).andReturn().getResponse()
                .getContentAsString(), "$.id");
        json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"LUNCH\",\"foodId\":\"" + food
                + "\",\"quick\":{\"name\":\"Les deux\",\"kcal\":300}}").andExpect(status().isBadRequest());
    }

    @Test
    void calendarAndStats() throws Exception {
        String food = JsonPath.read(mvc.perform(get("/api/foods/barcode/3017620422003").with(as(lea))).andReturn().getResponse()
                .getContentAsString(), "$.id");
        for (int d = 0; d < 3; d++) {
            json(post("/api/me/meals"), lea, "{\"day\":\"" + today.minusDays(d) + "\",\"slot\":\"BREAKFAST\",\"foodId\":\"" + food + "\",\"grams\":20}");
        }
        json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"DINNER\",\"foodId\":\"" + food + "\",\"grams\":50}");
        // the calendar: one line per day with something logged
        mvc.perform(get("/api/me/meals/days").param("from", today.minusDays(6).toString()).param("to", today.toString()).with(as(lea)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.targetKcal").isNumber())
                .andExpect(jsonPath("$.days.length()").value(3))
                .andExpect(jsonPath("$.days[2].entries").value(2))
                .andExpect(jsonPath("$.days[2].kcal").value(closeTo(377.3, 0.5)));
        mvc.perform(get("/api/me/meals/days").param("from", today.minusDays(200).toString()).param("to", today.toString()).with(as(lea)))
                .andExpect(status().isBadRequest());
        // the stats of the week: the spread eaten 4 times, mostly at breakfast
        mvc.perform(get("/api/me/meals/stats").param("days", "7").with(as(lea)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.daily.length()").value(3))
                .andExpect(jsonPath("$.topByCount[0].times").value(4))
                .andExpect(jsonPath("$.topByCount[0].name").value("Pâte à tartiner noisettes"))
                .andExpect(jsonPath("$.slots[0].slot").value("BREAKFAST"))
                .andExpect(jsonPath("$.slots[0].days").value(3))
                .andExpect(jsonPath("$.grades[0].grade").value("E"))
                .andExpect(jsonPath("$.totals.kcal").value(closeTo(593.0, 1)));
        mvc.perform(get("/api/me/meals/stats").param("days", "12").with(as(lea))).andExpect(status().isBadRequest());
        // nothing logged: empty but valid
        mvc.perform(get("/api/me/meals/stats").param("days", "30").with(as(hugo)))
                .andExpect(jsonPath("$.daily.length()").value(0))
                .andExpect(jsonPath("$.totals.kcal").value(0));
    }

    @Test
    void recipesAndTheCommunity() throws Exception {
        importCiqual();
        String apple = JsonPath.read(search(lea, "pomme", "local"), "$[0].id");
        String rice = JsonPath.read(search(lea, "riz", "local"), "$[0].id");
        String recipe = json(post("/api/me/recipes"), lea, """
                {"name":"Riz aux pommes","type":"DESSERT","servings":2,"notes":"Cuire, mélanger","shared":false,
                 "ingredients":[{"foodId":"%s","grams":200},{"foodId":"%s","grams":300}]}""".formatted(apple, rice))
                .andExpect(status().isCreated())
                // (52.1 × 2 + 143 × 3) / 2 servings
                .andExpect(jsonPath("$.perServing.kcal").value(closeTo(266.6, 0.1)))
                .andExpect(jsonPath("$.servingG").value(250.0))
                .andExpect(jsonPath("$.ingredients.length()").value(2))
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(recipe, "$.id");

        // private until shared
        mvc.perform(get("/api/recipes/" + id).with(as(hugo))).andExpect(status().isNotFound());
        mvc.perform(get("/api/recipes/community").with(as(hugo))).andExpect(jsonPath("$[*].id", not(hasItem(id))));
        json(put("/api/me/recipes/" + id), lea, """
                {"name":"Riz aux pommes","type":"DESSERT","servings":2,"shared":true,
                 "ingredients":[{"foodId":"%s","grams":200},{"foodId":"%s","grams":300}]}""".formatted(apple, rice)).andExpect(status().isOk());
        mvc.perform(get("/api/recipes/community").param("type", "DESSERT").with(as(hugo))).andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].author").value("lea"));
        mvc.perform(multipart("/api/me/recipes/" + id + "/image")
                        .file(new MockMultipartFile("file", "r.jpg", "image/jpeg", PhotoTest.jpegWithSecret())).with(as(lea)).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.thumbUrl").exists());
        mvc.perform(get("/api/recipes/" + id + "/image/thumb").with(as(hugo))).andExpect(status().isOk());

        // votes: not on one's own recipe
        json(post("/api/recipes/" + id + "/vote"), hugo, "{\"value\":1}").andExpect(jsonPath("$.score").value(1))
                .andExpect(jsonPath("$.myVote").value(1));
        json(post("/api/recipes/" + id + "/vote"), lea, "{\"value\":1}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("own_recipe"));

        // a copy, then logged as a meal (1.5 servings)
        String copy = JsonPath.read(mvc.perform(post("/api/recipes/" + id + "/copy").with(as(hugo)).with(csrf()))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.mine").value(true)).andExpect(jsonPath("$.shared").value(false))
                .andReturn().getResponse().getContentAsString(), "$.id");
        json(post("/api/me/meals"), hugo, "{\"day\":\"" + today + "\",\"slot\":\"DINNER\",\"recipeId\":\"" + copy + "\",\"servings\":1.5}")
                .andExpect(jsonPath("$.totals.kcal").value(closeTo(399.9, 0.2)));

        // hidden by a moderator: out of the community, still the owner's
        jdbc.update("update recipe set hidden = true where id = ?::uuid", id);
        mvc.perform(get("/api/recipes/community").with(as(hugo))).andExpect(jsonPath("$[*].id", not(hasItem(id))));
        mvc.perform(get("/api/recipes/" + id).with(as(hugo))).andExpect(status().isNotFound());
        mvc.perform(get("/api/recipes/" + id).with(as(lea))).andExpect(status().isOk()).andExpect(jsonPath("$.hidden").value(true));
        json(post("/api/me/recipes"), lea, "{\"name\":\"Vide\",\"type\":\"LUNCH\",\"servings\":1,\"ingredients\":[]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("recipe_empty"));
    }
}
