package fr.mbonnici.mybody365;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.AppUser;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** 1.19: « Décris ton repas », the meals one has often, the recap of a month and the read-only links for a coach. */
class HabitsTest extends AbstractIntegrationTest {

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

    private void food(String code, String name, String category, double kcal) {
        jdbc.update("""
                insert into food (id, source, source_code, source_version, name, category, search_name, kcal, protein_g, carbs_g, fat_g)
                values (?, 'CIQUAL', ?, '2025_11_03', ?, ?, lower(?), ?, 1, 1, 1)""", UUID.randomUUID(), code, name, category, name, kcal);
    }

    @Test
    void aMealSaidInWordsIsFoundCookedWithItsWeights() throws Exception {
        food("9100", "Riz blanc, cru", "pâtes, riz et céréales", 350);
        food("9104", "Riz blanc, cuit, sans sel ajouté", "pâtes, riz et céréales", 155);
        food("36018", "Poulet, filet sans peau grillé/poêlé", "viandes cuites", 141);
        food("36017", "Poulet, filet sans peau cru", "viandes crues", 110);
        food("13396", "Pomme, chair et peau, crue", "fruits", 54);
        String body = json(post("/api/me/meals/describe"), lea, """
                {"text":"200 g de poulet, du riz et une pomme"}""").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        // a meal is eaten cooked: the grilled chicken, the cooked rice (a recipe would have meant them raw)
        assertThat((String) JsonPath.read(body, "$[0].food.name")).startsWith("Poulet, filet sans peau grillé");
        assertThat((Double) JsonPath.read(body, "$[0].grams")).isEqualTo(200.0);
        assertThat((Boolean) JsonPath.read(body, "$[0].guessed")).isFalse();
        assertThat((String) JsonPath.read(body, "$[1].food.name")).startsWith("Riz blanc, cuit");
        // no quantity said: the portion of a plate, said as guessed
        assertThat((Double) JsonPath.read(body, "$[1].grams")).isEqualTo(160.0);
        assertThat((Boolean) JsonPath.read(body, "$[1].guessed")).isTrue();
        // « une pomme »: one piece
        assertThat((String) JsonPath.read(body, "$[2].food.name")).startsWith("Pomme");
        assertThat((Double) JsonPath.read(body, "$[2].grams")).isEqualTo(135.0);
        json(post("/api/me/meals/describe"), lea, """
                {"text":""}""").andExpect(status().isBadRequest());
    }

    @Test
    void aMealOneHasOftenIsKeptThenListedAndDeleted() throws Exception {
        json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"BREAKFAST\",\"quick\":{\"name\":\"Café\",\"kcal\":5}}")
                .andExpect(status().isCreated());
        json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"BREAKFAST\",\"quick\":{\"name\":\"Tartines\",\"kcal\":250,\"carbsG\":40}}")
                .andExpect(status().isCreated());
        String made = json(post("/api/me/meal-templates"), lea, "{\"name\":\"Mon petit-déj\",\"day\":\"" + today + "\",\"slot\":\"BREAKFAST\"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.items.length()").value(2)).andExpect(jsonPath("$.kcal").value(255.0))
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(made, "$.id");
        // the same name again: replaced, not doubled
        json(post("/api/me/meal-templates"), lea, "{\"name\":\"mon petit-déj\",\"day\":\"" + today + "\",\"slot\":\"BREAKFAST\"}")
                .andExpect(status().isCreated());
        mvc.perform(get("/api/me/meal-templates").with(as(lea))).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].items[1].name").value("Tartines")).andExpect(jsonPath("$[0].items[1].nutrients.carbsG").value(40.0));
        // a meal with nothing in it is not kept
        json(post("/api/me/meal-templates"), lea, "{\"name\":\"Rien\",\"day\":\"" + today + "\",\"slot\":\"DINNER\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("template_empty"));
        String latest = mvc.perform(get("/api/me/meal-templates").with(as(lea))).andReturn().getResponse().getContentAsString();
        String current = JsonPath.read(latest, "$[0].id");
        assertThat(current).isNotEqualTo(id);
        // someone else's: not found
        mvc.perform(delete("/api/me/meal-templates/" + current).with(as(hugo)).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(delete("/api/me/meal-templates/" + current).with(as(lea)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/me/meal-templates").with(as(lea))).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void theRecapOfAMonthTellsItsWeighInsMealsAndBestRun() throws Exception {
        YearMonth month = YearMonth.from(today).minusMonths(1);
        double[] kg = {80, 79.5, 79.2};
        for (int d = 1; d <= 3; d++) {
            json(put("/api/me/logs/" + month.atDay(d)), lea, "{\"weightKg\":" + kg[d - 1] + "}").andExpect(status().isOk());
        }
        json(put("/api/me/logs/" + month.atDay(10)), lea, "{\"weightKg\":78.9}").andExpect(status().isOk());
        json(post("/api/me/meals"), lea, "{\"day\":\"" + month.atDay(2) + "\",\"slot\":\"LUNCH\",\"quick\":{\"name\":\"Salade\",\"kcal\":400}}")
                .andExpect(status().isCreated());
        json(post("/api/me/meals"), lea, "{\"day\":\"" + month.atDay(3) + "\",\"slot\":\"LUNCH\",\"quick\":{\"name\":\"Salade\",\"kcal\":600}}")
                .andExpect(status().isCreated());
        mvc.perform(get("/api/me/recap").param("month", month.toString()).with(as(lea))).andExpect(status().isOk())
                .andExpect(jsonPath("$.weight.days").value(4)).andExpect(jsonPath("$.weight.startKg").value(80.0))
                .andExpect(jsonPath("$.weight.endKg").value(78.9)).andExpect(jsonPath("$.weight.deltaKg").value(-1.1))
                .andExpect(jsonPath("$.bestRun").value(3)).andExpect(jsonPath("$.meals.days").value(2)).andExpect(jsonPath("$.meals.avgKcal").value(500))
                .andExpect(jsonPath("$.meals.top[0].name").value("Salade")).andExpect(jsonPath("$.meals.top[0].count").value(2))
                .andExpect(jsonPath("$.firstName").isNotEmpty());
        // a month to come is not told
        mvc.perform(get("/api/me/recap").param("month", YearMonth.from(today).plusMonths(1).toString()).with(as(lea)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void aLinkForACoachShowsWhatWasChosenUntilRevoked() throws Exception {
        json(put("/api/me/logs/" + today), lea, "{\"weightKg\":77.6}").andExpect(status().isOk());
        String made = json(post("/api/me/share-links"), lea, """
                {"label":"Diét","days":7,"scopes":["WEIGHT","BP"]}""").andExpect(status().isCreated()).andReturn().getResponse()
                .getContentAsString();
        String url = JsonPath.read(made, "$.url");
        assertThat(url).contains("/partage#");
        String token = url.substring(url.indexOf('#') + 1);
        assertThat(token).hasSize(43);
        // only its hash is kept
        assertThat(jdbc.queryForObject("select count(*) from share_link where token_hash = ?", Integer.class, token)).isZero();
        // anyone holding it, without an account: what was chosen, nothing else
        mvc.perform(get("/api/shared/" + token)).andExpect(status().isOk()).andExpect(jsonPath("$.weight.logs.length()").value(1))
                .andExpect(jsonPath("$.weight.logs[0].kg").value(77.6)).andExpect(jsonPath("$.weight.logs[0].eveningKg").doesNotExist()).andExpect(jsonPath("$.meals").doesNotExist())
                .andExpect(jsonPath("$.label").value("Diét"));
        mvc.perform(get("/api/me/share-links").with(as(lea))).andExpect(jsonPath("$[0].openedCount").value(1))
                .andExpect(jsonPath("$[0].active").value(true));
        String id = JsonPath.read(made, "$.link.id");
        mvc.perform(delete("/api/me/share-links/" + id).with(as(hugo)).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(delete("/api/me/share-links/" + id).with(as(lea)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/shared/" + token)).andExpect(status().isGone());
        mvc.perform(get("/api/shared/not-a-token")).andExpect(status().isNotFound());
    }
}
