package fr.mbonnici.mybody365;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import fr.mbonnici.mybody365.push.ReleaseNotifier;
import fr.mbonnici.mybody365.push.ReminderScheduler;
import fr.mbonnici.mybody365.push.WebPushCrypto;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.AppUser;
import java.security.interfaces.ECPublicKey;
import java.time.LocalTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

/** Notification settings, device subscriptions (push services only) and workout sessions. */
class EngagementTest extends AbstractIntegrationTest {

    @Autowired
    ReminderScheduler reminders;

    @Autowired
    RecordingPushTransport pushes;

    @Autowired
    ReleaseNotifier releases;

    private AppUser lea;
    private AppUser hugo;

    @BeforeEach
    void setUp() {
        wipe();
        lea = account("lea@example.com", AppUser.Role.USER);
        hugo = account("hugo@example.com", AppUser.Role.USER);
    }

    private String subscription(String endpoint) throws Exception {
        String key = WebPushCrypto.b64(WebPushCrypto.rawPublic((ECPublicKey) WebPushCrypto.newKeyPair().getPublic()));
        return "{\"endpoint\":\"" + endpoint + "\",\"keys\":{\"p256dh\":\"" + key + "\",\"auth\":\"" + WebPushCrypto.b64(new byte[16]) + "\"}}";
    }

    @Test
    void settingsAndDevices() throws Exception {
        String publicKey = JsonPath.read(mvc.perform(get("/api/me/notifications").with(as(lea))).andExpect(status().isOk())
                .andExpect(jsonPath("$.devices").value(0))
                .andExpect(jsonPath("$.prefs.dailyTime").value("08:00"))
                .andReturn().getResponse().getContentAsString(), "$.publicKey");
        // the same key for everybody, 65 bytes
        mvc.perform(get("/api/me/notifications").with(as(hugo))).andExpect(jsonPath("$.publicKey").value(publicKey));
        org.assertj.core.api.Assertions.assertThat(WebPushCrypto.unb64(publicKey)).hasSize(65);

        mvc.perform(post("/api/me/push/subscriptions").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(subscription("https://fcm.googleapis.com/fcm/send/abc123")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.devices").value(1));
        // never a request to anything but a push service (no SSRF through a "subscription")
        for (String bad : new String[] {"http://fcm.googleapis.com/x", "https://evil.example.com/push", "https://169.254.169.254/latest",
                "https://googleapis.com.evil.io/x"}) {
            mvc.perform(post("/api/me/push/subscriptions").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                    .content(subscription(bad))).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("push_unsupported"));
        }

        mvc.perform(put("/api/me/notifications").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
                {"dailyEnabled":true,"dailyTime":"07:30","gymEnabled":true,"gymDays":"1,3,5","gymTime":"18:15","friendsEnabled":false}"""))
                .andExpect(jsonPath("$.prefs.dailyTime").value("07:30"))
                .andExpect(jsonPath("$.prefs.gymDays").value("1,3,5"))
                .andExpect(jsonPath("$.prefs.friendsEnabled").value(false));
        mvc.perform(put("/api/me/notifications").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
                {"dailyEnabled":true,"dailyTime":"25:00","gymEnabled":false,"gymDays":"8","gymTime":"18:00","friendsEnabled":true}"""))
                .andExpect(status().isBadRequest());

        // the reminder minute: one notification (no weigh-in yet), signed with the app key, and only once that day
        pushes.sent.clear();
        reminders.run(TrackingService.today(), LocalTime.of(7, 29));
        org.assertj.core.api.Assertions.assertThat(pushes.sent).isEmpty();
        reminders.run(TrackingService.today(), LocalTime.of(7, 30));
        org.assertj.core.api.Assertions.assertThat(pushes.sent).hasSize(1);
        org.assertj.core.api.Assertions.assertThat(pushes.sent.getFirst().headers().get("Authorization")).startsWith("vapid t=").endsWith(", k=" + publicKey);
        org.assertj.core.api.Assertions.assertThat(pushes.sent.getFirst().headers().get("Content-Encoding")).isEqualTo("aes128gcm");
        reminders.run(TrackingService.today(), LocalTime.of(7, 30));
        org.assertj.core.api.Assertions.assertThat(pushes.sent).hasSize(1);
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select last_daily from notification_pref where user_id = ?",
                java.time.LocalDate.class, lea.getId())).isEqualTo(TrackingService.today());

        mvc.perform(delete("/api/me/push/subscriptions").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"endpoint\":\"https://fcm.googleapis.com/fcm/send/abc123\"}")).andExpect(jsonPath("$.devices").value(0));
    }

    @Test
    void waterRemindersAndWhatsNew() throws Exception {
        mvc.perform(post("/api/me/push/subscriptions").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(subscription("https://fcm.googleapis.com/fcm/send/lea"))).andExpect(status().isOk());
        mvc.perform(post("/api/me/push/subscriptions").with(as(hugo)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(subscription("https://fcm.googleapis.com/fcm/send/hugo"))).andExpect(status().isOk());
        // defaults: no water reminder, the new versions on
        mvc.perform(get("/api/me/notifications").with(as(lea)))
                .andExpect(jsonPath("$.prefs.waterEnabled").value(false)).andExpect(jsonPath("$.prefs.updatesEnabled").value(true));
        mvc.perform(put("/api/me/notifications").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
                {"dailyEnabled":false,"dailyTime":"08:00","gymEnabled":false,"gymDays":"1,3,5","gymTime":"18:00","friendsEnabled":true,
                 "waterEnabled":true,"updatesEnabled":true}"""))
                .andExpect(jsonPath("$.prefs.waterEnabled").value(true));
        // an app older than 1.1 does not send them: they stay as they are
        mvc.perform(put("/api/me/notifications").with(as(hugo)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
                {"dailyEnabled":false,"dailyTime":"08:00","gymEnabled":false,"gymDays":"1,3,5","gymTime":"18:00","friendsEnabled":true,
                 "updatesEnabled":false}"""))
                .andExpect(jsonPath("$.prefs.updatesEnabled").value(false));
        mvc.perform(put("/api/me/notifications").with(as(hugo)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
                {"dailyEnabled":false,"dailyTime":"08:00","gymEnabled":false,"gymDays":"1,3,5","gymTime":"18:00","friendsEnabled":true}"""))
                .andExpect(jsonPath("$.prefs.updatesEnabled").value(false)).andExpect(jsonPath("$.prefs.waterEnabled").value(false));

        // water: only with the glasses of water on, at a slot, when behind, once per slot
        java.time.LocalDate today = TrackingService.today();
        pushes.sent.clear();
        reminders.run(today, LocalTime.of(10, 0));
        org.assertj.core.api.Assertions.assertThat(pushes.sent).isEmpty();
        jdbc.update("update app_user set water_goal = 8 where id = ?", lea.getId());
        reminders.run(today, LocalTime.of(9, 59));
        org.assertj.core.api.Assertions.assertThat(pushes.sent).isEmpty();
        reminders.run(today, LocalTime.of(10, 0));
        org.assertj.core.api.Assertions.assertThat(pushes.sent).hasSize(1);
        org.assertj.core.api.Assertions.assertThat(pushes.sent.getFirst().endpoint().toString()).endsWith("/lea");
        reminders.run(today, LocalTime.of(10, 0));
        org.assertj.core.api.Assertions.assertThat(pushes.sent).hasSize(1);
        // 4 glasses by 13:00 (8 × 5/13 → 4 expected): nothing to say
        jdbc.update("insert into water_log (user_id, day, glasses) values (?, ?, 4)", lea.getId(), today);
        reminders.run(today, LocalTime.of(13, 0));
        org.assertj.core.api.Assertions.assertThat(pushes.sent).hasSize(1);
        reminders.run(today, LocalTime.of(16, 0));
        org.assertj.core.api.Assertions.assertThat(pushes.sent).hasSize(2);
        org.assertj.core.api.Assertions.assertThat(ReminderScheduler.expectedGlasses(8, LocalTime.of(19, 0))).isEqualTo(7);

        // a new version: the first start records it, a newer one goes once to who kept "what's new" on
        jdbc.update("delete from app_state");
        pushes.sent.clear();
        org.assertj.core.api.Assertions.assertThat(releases.announce("1.0.0")).isZero();
        org.assertj.core.api.Assertions.assertThat(releases.announce("1.0.0")).isZero();
        org.assertj.core.api.Assertions.assertThat(releases.announce("0.9.9")).isZero();
        org.assertj.core.api.Assertions.assertThat(releases.announce("1.10.0")).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(pushes.sent).hasSize(1);
        org.assertj.core.api.Assertions.assertThat(pushes.sent.getFirst().endpoint().toString()).endsWith("/lea");
        org.assertj.core.api.Assertions.assertThat(releases.announce("1.10.0")).isZero();
        org.assertj.core.api.Assertions.assertThat(releases.announce("1.9.5")).isZero();
    }

    @Test
    void savedTimers() throws Exception {
        String body = "{\"name\":\" Gainage du soir \",\"work\":40,\"rest\":20,\"rounds\":5}";
        mvc.perform(post("/api/me/timers").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$[0].name").value("Gainage du soir")).andExpect(jsonPath("$[0].work").value(40));
        mvc.perform(post("/api/me/timers").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + "x".repeat(31) + "\",\"work\":40,\"rest\":20,\"rounds\":5}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/me/timers").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Trop court\",\"work\":2,\"rest\":20,\"rounds\":5}")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/me/timers").with(as(hugo))).andExpect(jsonPath("$.length()").value(0));
        String id = com.jayway.jsonpath.JsonPath.read(mvc.perform(get("/api/me/timers").with(as(lea))).andReturn().getResponse().getContentAsString(),
                "$[0].id");
        mvc.perform(delete("/api/me/timers/" + id).with(as(hugo)).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(delete("/api/me/timers/" + id).with(as(lea)).with(csrf())).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void workoutSessions() throws Exception {
        String today = TrackingService.today().toString();
        String body = mvc.perform(post("/api/me/workouts").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
                {"day":"%s","program":"full-body","workout":"a","durationMin":45,
                 "exercises":[{"id":"squat","sets":3,"weightKg":40},{"id":"push-up","sets":3}]}""".formatted(today)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$[0].exercises[0].weightKg").value(40.0))
                .andExpect(jsonPath("$[0].durationMin").value(45))
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$[0].id");
        mvc.perform(get("/api/me/workouts").with(as(hugo))).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(delete("/api/me/workouts/" + id).with(as(hugo)).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(post("/api/me/workouts").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"day\":\"" + today + "\",\"program\":\"../etc\",\"workout\":\"a\",\"exercises\":[]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(delete("/api/me/workouts/" + id).with(as(lea)).with(csrf())).andExpect(status().isNoContent());
    }
}
