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
import fr.mbonnici.mybody365.push.ReminderScheduler;
import fr.mbonnici.mybody365.push.WebPushCrypto;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.AppUser;
import java.security.interfaces.ECPublicKey;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** 1.9: challenges between friends, read from what the app keeps; a milestone reached shared with the friends. */
class ChallengesTest extends AbstractIntegrationTest {

    @Autowired
    RecordingPushTransport pushes;

    @Autowired
    ReminderScheduler reminders;

    private AppUser lea;
    private AppUser hugo;
    private AppUser ines;
    private final LocalDate today = TrackingService.today();

    @BeforeEach
    void setUp() {
        wipe();
        lea = account("lea@example.com", AppUser.Role.USER);
        hugo = account("hugo@example.com", AppUser.Role.USER);
        ines = account("ines@example.com", AppUser.Role.USER);
    }

    private ResultActions json(MockHttpServletRequestBuilder req, AppUser who, String body) throws Exception {
        return mvc.perform(req.with(as(who)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private void befriend(AppUser a, AppUser b) throws Exception {
        String url = JsonPath.read(mvc.perform(post("/api/me/friends/invite").with(as(a)).with(csrf())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.url");
        json(post("/api/me/friends/accept"), b, "{\"token\":\"" + url.substring(url.indexOf('#') + 1) + "\"}").andExpect(status().isOk());
    }

    private void device(AppUser who, String endpoint) throws Exception {
        String key = WebPushCrypto.b64(WebPushCrypto.rawPublic((ECPublicKey) WebPushCrypto.newKeyPair().getPublic()));
        json(post("/api/me/push/subscriptions"), who, "{\"endpoint\":\"" + endpoint + "\",\"keys\":{\"p256dh\":\"" + key + "\",\"auth\":\""
                + WebPushCrypto.b64(new byte[16]) + "\"}}").andExpect(status().isOk());
    }

    private void awaitPushes(int n) throws InterruptedException {
        for (int i = 0; i < 50 && pushes.sent.size() < n; i++) {
            Thread.sleep(100);
        }
        Thread.sleep(200);
        assertThat(pushes.sent).hasSize(n);
    }

    private void profile(AppUser who) throws Exception {
        json(put("/api/me/profile"), who, """
                {"sex":"FEMALE","birthDate":"1996-04-12","heightCm":168,"currentWeightKg":80,"goalWeightKg":70,"weeklyRateKg":0.5,
                 "job":"SEATED","sessionsPerWeek":2}""").andExpect(status().isOk());
    }

    @Test
    void aChallengeWithFriendsCountsTheDaysFromWhatTheAppKeeps() throws Exception {
        befriend(lea, hugo);
        device(hugo, "https://web.push.apple.com/hugo");
        pushes.sent.clear();

        // friends only, at least one, something known
        json(post("/api/me/challenges"), lea, "{\"kind\":\"WEIGH\",\"days\":7,\"friends\":[\"" + ines.getId() + "\"]}")
                .andExpect(status().isForbidden());
        json(post("/api/me/challenges"), lea, "{\"kind\":\"WEIGH\",\"days\":7,\"friends\":[]}").andExpect(status().isBadRequest());
        json(post("/api/me/challenges"), lea, "{\"kind\":\"STEPS\",\"days\":7,\"friends\":[\"" + hugo.getId() + "\"]}").andExpect(status().isBadRequest());
        json(post("/api/me/challenges"), lea, "{\"kind\":\"WEIGH\",\"days\":90,\"friends\":[\"" + hugo.getId() + "\"]}").andExpect(status().isBadRequest());

        String id = JsonPath.read(json(post("/api/me/challenges"), lea, "{\"kind\":\"WEIGH\",\"days\":7,\"friends\":[\"" + hugo.getId() + "\"]}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.length").value(7)).andExpect(jsonPath("$.elapsed").value(1))
                .andExpect(jsonPath("$.owner").value(true)).andExpect(jsonPath("$.myStatus").value("JOINED"))
                .andExpect(jsonPath("$.members.length()").value(2)).andReturn().getResponse().getContentAsString(), "$.id");
        // Hugo is told, once, without any figure
        awaitPushes(1);
        assertThat(pushes.sent.getFirst().endpoint().toString()).endsWith("/hugo");

        // an invitation: seen by Hugo, not by Inès
        mvc.perform(get("/api/me/challenges").with(as(hugo))).andExpect(jsonPath("$[0].myStatus").value("INVITED"));
        mvc.perform(get("/api/me/challenges").with(as(ines))).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(post("/api/me/challenges/" + id + "/join").with(as(ines)).with(csrf())).andExpect(status().isNotFound());

        // a weigh-in today counts for Léa; Hugo joins and weighs in too: both in the lead
        profile(lea);
        mvc.perform(get("/api/me/challenges").with(as(lea))).andExpect(jsonPath("$[0].members[0].done").value(1))
                .andExpect(jsonPath("$[0].members[0].days[0]").value(true)).andExpect(jsonPath("$[0].members[0].rank").value(1));
        mvc.perform(post("/api/me/challenges/" + id + "/join").with(as(hugo)).with(csrf())).andExpect(status().isOk())
                .andExpect(jsonPath("$.myStatus").value("JOINED"));
        mvc.perform(get("/api/me/challenges").with(as(lea))).andExpect(jsonPath("$[0].members[1].done").value(0))
                .andExpect(jsonPath("$[0].members[1].rank").value(2));
        profile(hugo);
        mvc.perform(get("/api/me/challenges").with(as(lea))).andExpect(jsonPath("$[0].members[0].rank").value(1))
                .andExpect(jsonPath("$[0].members[1].rank").value(1));

        // over: the result stays a while, it cannot be joined anymore
        jdbc.update("update challenge set start_day = ?, end_day = ? where id = ?::uuid", today.minusDays(9), today.minusDays(3), id);
        mvc.perform(get("/api/me/challenges").with(as(lea))).andExpect(jsonPath("$[0].ended").value(true))
                .andExpect(jsonPath("$[0].elapsed").value(7));

        // a member leaves, the owner stops it for everyone
        jdbc.update("update challenge set start_day = ?, end_day = ? where id = ?::uuid", today, today.plusDays(6), id);
        mvc.perform(delete("/api/me/challenges/" + id).with(as(hugo)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/me/challenges").with(as(hugo))).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/me/challenges").with(as(lea))).andExpect(jsonPath("$[0].members.length()").value(1));
        mvc.perform(delete("/api/me/challenges/" + id).with(as(lea)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/me/challenges").with(as(lea))).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void theWaterTheMealsAndThePhotoCountTheirOwnWay() throws Exception {
        befriend(lea, hugo);
        for (String kind : new String[] {"WATER", "MEALS"}) {
            json(post("/api/me/challenges"), lea, "{\"kind\":\"" + kind + "\",\"days\":3,\"friends\":[\"" + hugo.getId() + "\"]}")
                    .andExpect(status().isCreated());
        }
        // 8 glasses without a water goal: 7 do not count, 8 do
        json(put("/api/me/water/" + today), lea, "{\"glasses\":7}").andExpect(status().isOk());
        mvc.perform(get("/api/me/challenges").with(as(lea))).andExpect(jsonPath("$[?(@.kind == 'WATER')].members[0].done").value(0));
        json(put("/api/me/water/" + today), lea, "{\"glasses\":8}").andExpect(status().isOk());
        mvc.perform(get("/api/me/challenges").with(as(lea))).andExpect(jsonPath("$[?(@.kind == 'WATER')].members[0].done").value(1));
        // three meals of the day, not three lines of one meal
        for (String slot : new String[] {"BREAKFAST", "LUNCH", "LUNCH"}) {
            json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"" + slot + "\",\"quick\":{\"name\":\"Repas\",\"kcal\":400}}")
                    .andExpect(status().isCreated());
        }
        mvc.perform(get("/api/me/challenges").with(as(lea))).andExpect(jsonPath("$[?(@.kind == 'MEALS')].members[0].done").value(0));
        json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"DINNER\",\"quick\":{\"name\":\"Soupe\",\"kcal\":300}}")
                .andExpect(status().isCreated());
        mvc.perform(get("/api/me/challenges").with(as(lea))).andExpect(jsonPath("$[?(@.kind == 'MEALS')].members[0].done").value(1));
        // five challenges of one's own going on at most
        for (int i = 0; i < 3; i++) {
            json(post("/api/me/challenges"), lea, "{\"kind\":\"PHOTO\",\"days\":7,\"friends\":[\"" + hugo.getId() + "\"]}").andExpect(status().isCreated());
        }
        json(post("/api/me/challenges"), lea, "{\"kind\":\"PHOTO\",\"days\":7,\"friends\":[\"" + hugo.getId() + "\"]}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("too_many_challenges"));
    }

    @Test
    void aMilestoneReachedIsSharedWithoutItsReward() throws Exception {
        befriend(lea, hugo);
        profile(lea);
        String milestones = json(post("/api/me/milestones"), lea, "{\"targetKg\":78,\"reward\":\"Des baskets\"}").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(milestones, "$[0].id");
        // not reached yet: nothing to share
        json(post("/api/me/posts"), lea, "{\"kind\":\"MILESTONE\",\"milestoneId\":\"" + id + "\",\"preview\":true}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("milestone_not_reached"));
        json(put("/api/me/logs/" + today), lea, "{\"weightKg\":77.8}").andExpect(status().isOk());

        json(post("/api/me/posts"), lea, "{\"kind\":\"MILESTONE\",\"milestoneId\":\"" + id + "\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.changeKg").value(-2.0)).andExpect(jsonPath("$.data.targetKg").doesNotExist())
                .andExpect(jsonPath("$.data.reached").value(1)).andExpect(jsonPath("$.data.reward").doesNotExist());
        mvc.perform(get("/api/friends/posts").with(as(hugo))).andExpect(jsonPath("$[0].kind").value("MILESTONE"));
        // someone else's milestone is not mine to share
        json(post("/api/me/posts"), hugo, "{\"kind\":\"MILESTONE\",\"milestoneId\":\"" + id + "\",\"preview\":true}").andExpect(status().isNotFound());
    }

    @Test
    void anEveningWeighInIsKeptForItselfNextToTheMorningOne() throws Exception {
        profile(lea);
        json(put("/api/me/logs/" + today), lea, "{\"weightKg\":79.2,\"waistCm\":90}").andExpect(status().isOk());
        json(put("/api/me/logs/" + today + "/evening"), lea, "{\"weightKg\":80.1}").andExpect(status().isOk())
                .andExpect(jsonPath("$.current.weightKg").value(79.2)).andExpect(jsonPath("$.current.eveningKg").value(80.1));
        // the morning weigh-in noted again keeps the evening one; the trend stays the morning one's
        json(put("/api/me/logs/" + today), lea, "{\"weightKg\":79.0}").andExpect(status().isOk())
                .andExpect(jsonPath("$.current.weightKg").value(79.0)).andExpect(jsonPath("$.current.eveningKg").value(80.1));
        mvc.perform(get("/api/me/logs").with(as(lea))).andExpect(jsonPath("$[0].eveningKg").value(80.1));
        json(put("/api/me/logs/" + today + "/evening"), lea, "{\"weightKg\":12}").andExpect(status().isBadRequest());
        mvc.perform(delete("/api/me/logs/" + today + "/evening").with(as(lea)).with(csrf())).andExpect(status().isOk())
                .andExpect(jsonPath("$.current.eveningKg").doesNotExist());
    }

    /**
     * 1.17: at its time, one reminder for the challenges whose day is not done, once a day, none when it is done; every
     * notification is kept in the member's notification centre (latest first, by pages), new until the centre is opened
     */
    @Test
    void aDailyReminderForTheChallengesAndTheNotificationCentre() throws Exception {
        befriend(lea, hugo);
        device(lea, "https://web.push.apple.com/lea");
        device(hugo, "https://web.push.apple.com/hugo");
        // what an earlier test sent late is not this one's
        Thread.sleep(300);
        pushes.sent.clear();
        mvc.perform(get("/api/me/notifications").with(as(lea))).andExpect(jsonPath("$.prefs.challengeEnabled").value(true))
                .andExpect(jsonPath("$.prefs.challengeTime").value("20:00"));
        json(post("/api/me/challenges"), lea, "{\"kind\":\"WEIGH\",\"days\":7,\"friends\":[\"" + hugo.getId() + "\"]}").andExpect(status().isCreated());
        awaitPushes(1);
        // Hugo's invitation is in his centre, new
        mvc.perform(get("/api/me/notifications/history").with(as(hugo))).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].kind").value("FRIEND_CHALLENGE")).andExpect(jsonPath("$.items[0].url").value("/app/challenges"))
                .andExpect(jsonPath("$.items[0].unread").value(true));
        mvc.perform(get("/api/me/todo").with(as(hugo))).andExpect(jsonPath("$.notifications").value(1));

        // 20:00: Léa has not weighed in, Hugo has not joined (invited only): Léa alone is reminded, once
        pushes.sent.clear();
        reminders.run(today, java.time.LocalTime.of(19, 59));
        assertThat(pushes.sent).isEmpty();
        reminders.run(today, java.time.LocalTime.of(20, 0));
        assertThat(pushes.sent).hasSize(1);
        assertThat(pushes.sent.getFirst().endpoint().toString()).endsWith("/lea");
        reminders.run(today, java.time.LocalTime.of(20, 0));
        assertThat(pushes.sent).hasSize(1);
        mvc.perform(get("/api/me/notifications/history").with(as(lea))).andExpect(jsonPath("$.items[0].kind").value("CHALLENGE_REMINDER"))
                .andExpect(jsonPath("$.items[0].title").value("Ton défi t’attend 🏆"))
                .andExpect(jsonPath("$.items[0].body").value("Ta pesée compte pour le défi (jour 1 sur 7)"));

        // the next day, weighed in: nothing; a time of one's own, or off
        jdbc.update("update notification_pref set last_challenge = ? where user_id = ?", today.minusDays(1), lea.getId());
        profile(lea);
        pushes.sent.clear();
        reminders.run(today, java.time.LocalTime.of(20, 0));
        assertThat(pushes.sent).isEmpty();
        json(put("/api/me/notifications"), lea, """
                {"dailyEnabled":false,"dailyTime":"08:00","gymEnabled":false,"gymDays":"1,3,5","gymTime":"18:00","friendsEnabled":true,
                 "challengeEnabled":false,"challengeTime":"21:30"}""").andExpect(jsonPath("$.prefs.challengeEnabled").value(false))
                .andExpect(jsonPath("$.prefs.challengeTime").value("21:30"));
        json(put("/api/me/notifications"), lea, """
                {"dailyEnabled":false,"dailyTime":"08:00","gymEnabled":false,"gymDays":"1,3,5","gymTime":"18:00","friendsEnabled":true,
                 "challengeTime":"25:00"}""").andExpect(status().isBadRequest());

        // the centre: latest first, by pages of 20, read once opened; another member's never shows
        for (int i = 0; i < 25; i++) {
            jdbc.update("insert into notification_log (id, user_id, kind, title, body, url, created_at) values (?, ?, 'TEST', ?, 'b', '/app', now() - ?::interval)",
                    java.util.UUID.randomUUID(), hugo.getId(), "n" + i, (i + 1) + " hours");
        }
        mvc.perform(get("/api/me/notifications/history").with(as(hugo))).andExpect(jsonPath("$.total").value(26))
                .andExpect(jsonPath("$.pages").value(2)).andExpect(jsonPath("$.items.length()").value(20))
                .andExpect(jsonPath("$.items[0].kind").value("FRIEND_CHALLENGE")).andExpect(jsonPath("$.items[1].title").value("n0"));
        mvc.perform(get("/api/me/notifications/history?page=1").with(as(hugo))).andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.items.length()").value(6)).andExpect(jsonPath("$.items[5].title").value("n24"));
        mvc.perform(get("/api/me/notifications/history?page=99").with(as(hugo))).andExpect(jsonPath("$.page").value(1));
        mvc.perform(post("/api/me/notifications/seen").with(as(hugo)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/me/todo").with(as(hugo))).andExpect(jsonPath("$.notifications").value(0));
        mvc.perform(get("/api/me/notifications/history").with(as(hugo))).andExpect(jsonPath("$.items[0].unread").value(false));
        mvc.perform(get("/api/me/notifications/history").with(as(ines))).andExpect(jsonPath("$.total").value(0));
    }
}
