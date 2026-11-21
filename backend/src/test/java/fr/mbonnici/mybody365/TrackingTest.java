package fr.mbonnici.mybody365;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.AppUser;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** Onboarding profile → weigh-ins → summary (streak, goal, energy). */
class TrackingTest extends AbstractIntegrationTest {

    private AppUser lea;
    private final LocalDate today = TrackingService.today();

    @BeforeEach
    void setUp() {
        wipe();
        lea = account("lea@example.com", AppUser.Role.USER);
    }

    private String profile(String goal, String rate) {
        return """
                {"sex":"FEMALE","birthDate":"1996-04-12","heightCm":168,"activityLevel":"LIGHT",
                 "currentWeightKg":78.4,"goalWeightKg":%s,"weeklyRateKg":%s}""".formatted(goal, rate);
    }

    private org.springframework.test.web.servlet.ResultActions putJson(String url, String body) throws Exception {
        return mvc.perform(put(url).with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void theActivityFromTheJobAndTheSessionsThenTheSplitAndTheSessionsNoted() throws Exception {
        String base = """
                {"sex":"FEMALE","birthDate":"1996-04-12","heightCm":168,"currentWeightKg":78.4,"goalWeightKg":68,"weeklyRateKg":0.5,%s}""";
        // seated with 3 sessions a week: 1.29 (the level « light », 1.375, would have counted more)
        String body = putJson("/api/me/profile", base.formatted("\"job\":\"SEATED\",\"sessionsPerWeek\":3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.job").value("SEATED"))
                .andExpect(jsonPath("$.profile.sessionsPerWeek").value(3))
                .andExpect(jsonPath("$.profile.activityFactor").value(1.29))
                .andExpect(jsonPath("$.profile.activityLevel").value("LIGHT"))
                .andExpect(jsonPath("$.profile.macroSplit").value("BALANCED"))
                .andReturn().getResponse().getContentAsString();
        int bmr = com.jayway.jsonpath.JsonPath.read(body, "$.energy.bmr");
        int tdee = com.jayway.jsonpath.JsonPath.read(body, "$.energy.tdee");
        org.assertj.core.api.Assertions.assertThat(Math.abs(tdee - bmr * 1.29)).isLessThan(2);

        // an older app sends its level: the answers stay while the level is the same, and go when it changes
        putJson("/api/me/profile", base.formatted("\"activityLevel\":\"LIGHT\"")).andExpect(jsonPath("$.profile.job").value("SEATED"));
        putJson("/api/me/profile", base.formatted("\"activityLevel\":\"ACTIVE\""))
                .andExpect(jsonPath("$.profile.job").doesNotExist())
                .andExpect(jsonPath("$.profile.activityLevel").value("ACTIVE"));
        // neither: refused; a job without its sessions too
        putJson("/api/me/profile", base.formatted("\"activityLevel\":null")).andExpect(status().isBadRequest());
        putJson("/api/me/profile", base.formatted("\"job\":\"STANDING\"")).andExpect(status().isBadRequest());
        putJson("/api/me/profile", base.formatted("\"job\":\"STANDING\",\"sessionsPerWeek\":15")).andExpect(status().isBadRequest());

        // the split of the macros
        putJson("/api/me/profile/macros", "{\"split\":\"LOW_CARB\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.macroSplit").value("LOW_CARB"));
        putJson("/api/me/profile/macros", "{\"split\":\"KETO\"}").andExpect(status().isBadRequest());

        // the sessions are no longer noted (1.9): the summary says nothing of them
        mvc.perform(get("/api/me/summary").with(as(lea))).andExpect(jsonPath("$.training").doesNotExist());
    }

    @Test
    void theRealNeedsFromTheMealsAndTheWeighInsWhenAskedFor() throws Exception {
        putJson("/api/me/profile", """
                {"sex":"FEMALE","birthDate":"1996-04-12","heightCm":168,"currentWeightKg":78.85,"goalWeightKg":68,"weeklyRateKg":0.5,
                 "job":"SEATED","sessionsPerWeek":3}""").andExpect(status().isOk())
                .andExpect(jsonPath("$.energy.realTdee").doesNotExist())
                .andExpect(jsonPath("$.energy.adaptive").value(false));
        // 23 days of weigh-ins going down, and 22 days of meals at 1 900 kcal
        for (int d = 23; d >= 1; d--) {
            putJson("/api/me/logs/" + today.minusDays(d), "{\"weightKg\":" + (80 - (23 - d) * 0.05) + "}").andExpect(status().isOk());
        }
        for (int d = 22; d >= 1; d--) {
            mvc.perform(post("/api/me/meals").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
                    {"day":"%s","slot":"LUNCH","quick":{"name":"Repas","kcal":1900}}""".formatted(today.minusDays(d))))
                    .andExpect(status().isCreated());
        }
        String body = mvc.perform(get("/api/me/summary").with(as(lea)))
                .andExpect(jsonPath("$.energy.realTdee").isNumber())
                .andExpect(jsonPath("$.energy.realDays").value(22))
                .andExpect(jsonPath("$.energy.adaptive").value(false))
                .andReturn().getResponse().getContentAsString();
        int real = com.jayway.jsonpath.JsonPath.read(body, "$.energy.realTdee");
        int estimated = com.jayway.jsonpath.JsonPath.read(body, "$.energy.estimatedTdee");
        int tdee = com.jayway.jsonpath.JsonPath.read(body, "$.energy.tdee");
        // she ate 1 900 a day and lost weight: she spends more than that; the formula still counts until asked
        org.assertj.core.api.Assertions.assertThat(real).isGreaterThan(1900);
        org.assertj.core.api.Assertions.assertThat(tdee).isEqualTo(estimated);

        // asked for: the target counts on the real needs
        String on = putJson("/api/me/profile/adaptive", "{\"on\":true}").andExpect(status().isOk())
                .andExpect(jsonPath("$.energy.adaptive").value(true))
                .andExpect(jsonPath("$.profile.adaptiveTdee").value(true))
                .andReturn().getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat((int) com.jayway.jsonpath.JsonPath.read(on, "$.energy.tdee")).isEqualTo(real);
        putJson("/api/me/profile/adaptive", "{\"on\":false}").andExpect(jsonPath("$.energy.tdee").value(estimated));
    }

    @Test
    void theSummaryNeedsTheProfile() throws Exception {
        mvc.perform(get("/api/me/summary").with(as(lea))).andExpect(status().isNotFound());
        mvc.perform(get("/api/auth/me").with(as(lea))).andExpect(jsonPath("$.account.profileComplete").value(false));
    }

    @Test
    void onboardingThenWeighIns() throws Exception {
        mvc.perform(put("/api/me/profile").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(profile("68", "0.5")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.startWeightKg").value(78.4))
                .andExpect(jsonPath("$.current.weightKg").value(78.4))
                .andExpect(jsonPath("$.streak.days").value(1))
                .andExpect(jsonPath("$.streak.todayDone").value(true))
                .andExpect(jsonPath("$.goal.remainingKg").value(-10.4))
                .andExpect(jsonPath("$.goal.planDate").value(today.plusDays(146).toString()))
                .andExpect(jsonPath("$.energy.targetKcal").isNumber());
        mvc.perform(get("/api/auth/me").with(as(lea))).andExpect(jsonPath("$.account.profileComplete").value(true));

        // yesterday and the day before: a 3-day streak
        for (int i = 1; i <= 2; i++) {
            mvc.perform(put("/api/me/logs/" + today.minusDays(i)).with(as(lea)).with(csrf())
                            .contentType(MediaType.APPLICATION_JSON).content("{\"weightKg\":" + (78.4 + i * 0.2) + "}"))
                    .andExpect(status().isOk());
        }
        mvc.perform(get("/api/me/summary").with(as(lea))).andExpect(jsonPath("$.streak.days").value(3));

        // measurements without a weight do not validate a day
        mvc.perform(put("/api/me/logs/" + today.minusDays(5)).with(as(lea)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"waistCm\":88.5}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.streak.days").value(3));

        mvc.perform(get("/api/me/logs").with(as(lea)))
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].waistCm").value(88.5))
                .andExpect(jsonPath("$[3].trendKg").isNumber());

        mvc.perform(delete("/api/me/logs/" + today).with(as(lea)).with(csrf())).andExpect(status().isNoContent());
        // today not weighed yet: the streak from yesterday is still alive
        mvc.perform(get("/api/me/summary").with(as(lea)))
                .andExpect(jsonPath("$.streak.days").value(2))
                .andExpect(jsonPath("$.streak.todayDone").value(false));
    }

    @Test
    void guardrails() throws Exception {
        // BMI under 18.5 for 168 cm: under 52.2 kg
        mvc.perform(put("/api/me/profile").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(profile("50", "0.5")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("goal_too_low"));
        mvc.perform(put("/api/me/profile").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(profile("68", "0.62")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("invalid_rate"));
        // 1 % of 78.4 kg a week at most: 0.75 kg
        mvc.perform(put("/api/me/profile").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(profile("68", "0.8")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("pace_too_fast"));
        mvc.perform(put("/api/me/profile").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(profile("68", "0.6")))
                .andExpect(status().isOk());
        mvc.perform(put("/api/me/profile").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(profile("68", "1.0").replace("1996-04-12", today.minusYears(17).toString())))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("too_young"));
        // the fastest pace allowed is flagged
        mvc.perform(put("/api/me/profile").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(profile("68", "0.75")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.warnings", hasItem("fast_pace")));
    }

    @Test
    void glassesOfWaterOnceTheTrackerIsOn() throws Exception {
        String day = today.toString();
        mvc.perform(get("/api/me/water/" + day).with(as(lea))).andExpect(jsonPath("$.glasses").value(0))
                .andExpect(jsonPath("$.goal").doesNotExist());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/me").with(as(lea)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"waterGoal\":8}")).andExpect(jsonPath("$.waterGoal").value(8));
        mvc.perform(put("/api/me/water/" + day).with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"glasses\":3}"))
                .andExpect(jsonPath("$.glasses").value(3)).andExpect(jsonPath("$.goal").value(8));
        mvc.perform(put("/api/me/water/" + day).with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"glasses\":41}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/me/water/" + today.plusDays(5)).with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"glasses\":2}")).andExpect(status().isBadRequest());
        mvc.perform(put("/api/me/water/" + day).with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"glasses\":0}"))
                .andExpect(jsonPath("$.glasses").value(0));
        // off again
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/me").with(as(lea)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"waterGoal\":0}")).andExpect(jsonPath("$.waterGoal").doesNotExist());
    }

    @Test
    void logsNeedAProfileAndSomething() throws Exception {
        mvc.perform(put("/api/me/logs/" + today).with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"weightKg\":78}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("profile_missing"));
        mvc.perform(put("/api/me/profile").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(profile("68", "0.5")))
                .andExpect(status().isOk());
        mvc.perform(put("/api/me/logs/" + today).with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("empty_log"));
        mvc.perform(put("/api/me/logs/" + today.plusDays(5)).with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"weightKg\":78}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("invalid_day"));
    }

    /** 1.14: the starting weight is changed from « Mon objectif »; the weigh-ins stay as they were */
    @Test
    void theStartingWeightIsChangedLaterTheWeighInsStay() throws Exception {
        String base = """
                {"sex":"FEMALE","birthDate":"1996-04-12","heightCm":168,"job":"SEATED","sessionsPerWeek":2,"currentWeightKg":78.4,
                 "goalWeightKg":68,"weeklyRateKg":0.5%s}""";
        // the first save: today's weight is the start
        putJson("/api/me/profile", base.formatted(",\"startWeightKg\":90")).andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.startWeightKg").value(78.4));
        putJson("/api/me/profile", base.formatted(",\"startWeightKg\":81.2")).andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.startWeightKg").value(81.2));
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select weight_kg from body_log where user_id = ?", Double.class, lea.getId()))
                .isEqualTo(78.4);
        // left out: kept; out of bounds: refused
        putJson("/api/me/profile", base.formatted("")).andExpect(jsonPath("$.profile.startWeightKg").value(81.2));
        putJson("/api/me/profile", base.formatted(",\"startWeightKg\":12")).andExpect(status().isBadRequest());
        // 1.16: a mistyped start: the weigh-in of the start day is put right with it, the curve no longer starts on the typo
        putJson("/api/me/profile", base.formatted(",\"startWeightKg\":82.6,\"startLogToo\":true")).andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.startWeightKg").value(82.6))
                .andExpect(jsonPath("$.current.weightKg").value(82.6));
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select weight_kg from body_log where user_id = ?", Double.class, lea.getId()))
                .isEqualTo(82.6);
    }
}
