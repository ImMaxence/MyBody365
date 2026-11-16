package fr.mbonnici.mybody365;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
}
