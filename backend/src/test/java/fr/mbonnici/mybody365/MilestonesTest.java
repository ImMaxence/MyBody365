package fr.mbonnici.mybody365;

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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** 1.8: milestones of one's own on the way to the goal, and the streak's own look. */
class MilestonesTest extends AbstractIntegrationTest {

    private AppUser lea;
    private AppUser hugo;
    private LocalDate today;

    @BeforeEach
    void setUp() throws Exception {
        wipe();
        lea = account("lea@example.com", AppUser.Role.USER);
        hugo = account("hugo@example.com", AppUser.Role.USER);
        today = TrackingService.today();
        json(put("/api/me/profile"), lea, """
                {"sex":"FEMALE","birthDate":"1995-06-15","heightCm":168,"job":"SEATED","sessionsPerWeek":2,
                 "currentWeightKg":80,"goalWeightKg":70,"weeklyRateKg":0.5}""").andExpect(status().isOk());
    }

    private ResultActions json(MockHttpServletRequestBuilder req, AppUser who, String body) throws Exception {
        return mvc.perform(req.with(as(who)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions weigh(LocalDate day, double kg) throws Exception {
        return json(put("/api/me/logs/" + day), lea, "{\"weightKg\":" + kg + "}");
    }

    @Test
    void milestonesAreReachedByTheWeighInThatPassesThem() throws Exception {
        json(post("/api/me/milestones"), lea, "{\"targetKg\":77,\"reward\":\"  Un resto  \"}").andExpect(status().isCreated());
        json(post("/api/me/milestones"), lea, "{\"targetKg\":74.04}").andExpect(status().isCreated())
                // in the order of the way (losing: the heaviest first), the weight rounded to 100 g, the reward trimmed
                .andExpect(jsonPath("$[0].targetKg").value(77.0)).andExpect(jsonPath("$[0].reward").value("Un resto"))
                .andExpect(jsonPath("$[1].targetKg").value(74.0)).andExpect(jsonPath("$[1].reachedOn").doesNotExist());
        json(post("/api/me/milestones"), lea, "{\"targetKg\":74}").andExpect(status().isConflict());
        json(post("/api/me/milestones"), lea, "{\"targetKg\":20}").andExpect(status().isBadRequest());

        // 77.5: not yet; 76.8: the first one, on that day; it stays reached when the weight goes back up
        weigh(today.minusDays(3), 77.5).andExpect(status().isOk());
        mvc.perform(get("/api/me/milestones").with(as(lea))).andExpect(jsonPath("$[0].reachedOn").doesNotExist());
        weigh(today.minusDays(1), 76.8);
        weigh(today, 77.6);
        mvc.perform(get("/api/me/milestones").with(as(lea))).andExpect(jsonPath("$[0].reachedOn").value(today.minusDays(1).toString()))
                .andExpect(jsonPath("$[1].reachedOn").doesNotExist());

        // another weight: reached again from scratch; one already passed is reached on the first day a weigh-in did
        String id = JsonPath.read(mvc.perform(get("/api/me/milestones").with(as(lea))).andReturn().getResponse().getContentAsString(), "$[0].id");
        json(put("/api/me/milestones/" + id), lea, "{\"targetKg\":75,\"reward\":\"Un resto\"}").andExpect(jsonPath("$[0].targetKg").value(75.0))
                .andExpect(jsonPath("$[0].reachedOn").doesNotExist());
        json(post("/api/me/milestones"), lea, "{\"targetKg\":78}").andExpect(jsonPath("$[0].targetKg").value(78.0))
                .andExpect(jsonPath("$[0].reachedOn").value(today.minusDays(3).toString()));

        // someone else's: neither changed nor deleted
        json(put("/api/me/milestones/" + id), hugo, "{\"targetKg\":60}").andExpect(status().isNotFound());
        mvc.perform(delete("/api/me/milestones/" + id).with(as(hugo)).with(csrf())).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(delete("/api/me/milestones/" + id).with(as(lea)).with(csrf())).andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void tenAtMost() throws Exception {
        for (int kg = 79; kg > 69; kg--) {
            json(post("/api/me/milestones"), lea, "{\"targetKg\":" + kg + "}").andExpect(status().isCreated());
        }
        json(post("/api/me/milestones"), lea, "{\"targetKg\":69}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("milestones_full"));
    }

    @Test
    void theStreakLooksAsChosen() throws Exception {
        mvc.perform(get("/api/auth/me").with(as(lea))).andExpect(jsonPath("$.account.streakIcon").value("flame"))
                .andExpect(jsonPath("$.account.streakColor").value("orange"));
        json(patch("/api/me"), lea, "{\"streakIcon\":\"muscle\",\"streakColor\":\"violet\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.streakIcon").value("muscle")).andExpect(jsonPath("$.streakColor").value("violet"));
        // only the app's choices
        json(patch("/api/me"), lea, "{\"streakIcon\":\"<script>\"}").andExpect(status().isBadRequest());
        json(patch("/api/me"), lea, "{\"streakColor\":\"#ff0000\"}").andExpect(status().isBadRequest());
        // the other fields stay as they were
        json(patch("/api/me"), lea, "{\"waterGoal\":8}").andExpect(jsonPath("$.streakIcon").value("muscle"));
    }
}
