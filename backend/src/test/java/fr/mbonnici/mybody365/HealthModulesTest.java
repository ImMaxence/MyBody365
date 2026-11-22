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
import fr.mbonnici.mybody365.push.ReminderScheduler;
import fr.mbonnici.mybody365.push.WebPushCrypto;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.AppUser;
import java.security.interfaces.ECPublicKey;
import java.time.LocalDate;
import java.time.LocalTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** 1.17: the optional modules: the blood pressure (morning, evening, the average of its readings) and the pill box. */
class HealthModulesTest extends AbstractIntegrationTest {

    @Autowired
    RecordingPushTransport pushes;

    @Autowired
    ReminderScheduler reminders;

    private AppUser lea;
    private AppUser hugo;
    private final LocalDate today = TrackingService.today();

    @BeforeEach
    void setUp() {
        wipe();
        lea = account("lea@example.com", AppUser.Role.USER);
        hugo = account("hugo@example.com", AppUser.Role.USER);
    }

    private ResultActions json(MockHttpServletRequestBuilder req, AppUser who, String body) throws Exception {
        return mvc.perform(req.with(as(who)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private void device(AppUser who, String endpoint) throws Exception {
        String key = WebPushCrypto.b64(WebPushCrypto.rawPublic((ECPublicKey) WebPushCrypto.newKeyPair().getPublic()));
        json(post("/api/me/push/subscriptions"), who, "{\"endpoint\":\"" + endpoint + "\",\"keys\":{\"p256dh\":\"" + key + "\",\"auth\":\""
                + WebPushCrypto.b64(new byte[16]) + "\"}}").andExpect(status().isOk());
    }

    @Test
    void theBloodPressureIsTheAverageOfItsReadingsAndRemindedWhenOn() throws Exception {
        // off until turned on
        mvc.perform(get("/api/me").with(as(lea))).andExpect(jsonPath("$.bpEnabled").value(false)).andExpect(jsonPath("$.pillsEnabled").value(false));
        json(patch("/api/me"), lea, "{\"bpEnabled\":true}").andExpect(jsonPath("$.bpEnabled").value(true));

        // three readings: their average (the pulse of those that give it)
        json(put("/api/me/bp/" + today + "/MORNING"), lea, """
                {"readings":[{"systolic":131,"diastolic":84,"pulse":70},{"systolic":128,"diastolic":82},{"systolic":126,"diastolic":81,"pulse":66}]}""")
                .andExpect(status().isOk()).andExpect(jsonPath("$.systolic").value(128)).andExpect(jsonPath("$.diastolic").value(82))
                .andExpect(jsonPath("$.pulse").value(68)).andExpect(jsonPath("$.readings").value(3));
        // nonsense refused: a diastolic over the systolic, out of range, four readings, tomorrow
        json(put("/api/me/bp/" + today + "/EVENING"), lea, "{\"readings\":[{\"systolic\":80,\"diastolic\":90}]}").andExpect(status().isBadRequest());
        json(put("/api/me/bp/" + today + "/EVENING"), lea, "{\"readings\":[{\"systolic\":300,\"diastolic\":90}]}").andExpect(status().isBadRequest());
        json(put("/api/me/bp/" + today + "/EVENING"), lea, """
                {"readings":[{"systolic":120,"diastolic":80},{"systolic":120,"diastolic":80},{"systolic":120,"diastolic":80},{"systolic":120,"diastolic":80}]}""")
                .andExpect(status().isBadRequest());
        json(put("/api/me/bp/" + today.plusDays(1) + "/EVENING"), lea, "{\"readings\":[{\"systolic\":120,\"diastolic\":80}]}")
                .andExpect(status().isBadRequest());
        json(put("/api/me/bp/" + today.minusDays(1) + "/EVENING"), lea, "{\"readings\":[{\"systolic\":122,\"diastolic\":79}]}").andExpect(status().isOk());
        mvc.perform(get("/api/me/bp").with(as(lea))).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].day").value(today.minusDays(1).toString())).andExpect(jsonPath("$[1].moment").value("MORNING"));
        // never another member's
        mvc.perform(get("/api/me/bp").with(as(hugo))).andExpect(jsonPath("$.length()").value(0));

        // the reminders: the evening one only (the morning is measured), once; not for Hugo (module off)
        device(lea, "https://web.push.apple.com/lea");
        device(hugo, "https://web.push.apple.com/hugo");
        mvc.perform(get("/api/me/bp/settings").with(as(lea))).andExpect(jsonPath("$.reminder").value(true))
                .andExpect(jsonPath("$.morning").value("07:30")).andExpect(jsonPath("$.evening").value("21:00"));
        Thread.sleep(200);
        pushes.sent.clear();
        reminders.run(today, LocalTime.of(7, 30));
        assertThat(pushes.sent).isEmpty();
        reminders.run(today, LocalTime.of(21, 0));
        assertThat(pushes.sent).hasSize(1);
        assertThat(pushes.sent.getFirst().endpoint().toString()).endsWith("/lea");
        reminders.run(today, LocalTime.of(21, 0));
        assertThat(pushes.sent).hasSize(1);
        mvc.perform(get("/api/me/notifications/history").with(as(lea))).andExpect(jsonPath("$.items[0].kind").value("BP_REMINDER"))
                .andExpect(jsonPath("$.items[0].title").value("Ta tension du soir 🩺"));
        json(put("/api/me/bp/settings"), lea, "{\"reminder\":false,\"morning\":\"06:45\",\"evening\":\"22:15\"}")
                .andExpect(jsonPath("$.reminder").value(false)).andExpect(jsonPath("$.morning").value("06:45"));
        json(put("/api/me/bp/settings"), lea, "{\"reminder\":true,\"morning\":\"25:00\",\"evening\":\"22:15\"}").andExpect(status().isBadRequest());

        mvc.perform(delete("/api/me/bp/" + today + "/MORNING").with(as(lea)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/me/bp").with(as(lea))).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void thePillBoxTicksTheIntakesAndRemindsWithoutNamingTheMedicine() throws Exception {
        json(patch("/api/me"), lea, "{\"pillsEnabled\":true}").andExpect(jsonPath("$.pillsEnabled").value(true));
        String all = "[1,2,3,4,5,6,7]";
        String created = json(post("/api/me/medications"), lea, "{\"name\":\"Levothyrox\",\"dose\":\"75 µg\",\"times\":[\"08:00\"],\"days\":" + all
                + ",\"reminders\":true}").andExpect(status().isCreated()).andExpect(jsonPath("$.items[0].name").value("Levothyrox"))
                .andExpect(jsonPath("$.intakes[0].slot").value("08:00")).andExpect(jsonPath("$.intakes[0].taken").value(false))
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(created, "$.items[0].id");
        json(post("/api/me/medications"), lea, "{\"name\":\"Vitamine D\",\"times\":[\"20:00\",\"08:00\"],\"days\":" + all + ",\"reminders\":false}")
                .andExpect(jsonPath("$.items[1].times[0]").value("08:00")).andExpect(jsonPath("$.intakes.length()").value(3));
        // a wrong time, no time, a day 8
        json(post("/api/me/medications"), lea, "{\"name\":\"X\",\"times\":[\"8h\"],\"days\":" + all + ",\"reminders\":true}").andExpect(status().isBadRequest());
        json(post("/api/me/medications"), lea, "{\"name\":\"X\",\"times\":[],\"days\":" + all + ",\"reminders\":true}").andExpect(status().isBadRequest());
        json(post("/api/me/medications"), lea, "{\"name\":\"X\",\"times\":[\"08:00\"],\"days\":[8],\"reminders\":true}").andExpect(status().isBadRequest());

        // 08:00: one notification for the one with reminders, without its name; once
        device(lea, "https://web.push.apple.com/lea");
        // the weigh-in reminder of 08:00 is not this test's
        jdbc.update("update notification_pref set daily_enabled = false where user_id = ?", lea.getId());
        Thread.sleep(200);
        pushes.sent.clear();
        reminders.run(today, LocalTime.of(8, 0));
        assertThat(pushes.sent).hasSize(1);
        reminders.run(today, LocalTime.of(8, 0));
        assertThat(pushes.sent).hasSize(1);
        mvc.perform(get("/api/me/notifications/history").with(as(lea))).andExpect(jsonPath("$.items[0].kind").value("PILL"))
                .andExpect(jsonPath("$.items[0].title").value("Ton traitement de 08:00 💊"))
                .andExpect(jsonPath("$.items[0].body").value("Ouvre MyBody365 pour le cocher dans ton pilulier"));

        // ticked, then not; a time it does not have refused; not Hugo's
        json(put("/api/me/medications/" + id + "/intake"), lea, "{\"day\":\"" + today + "\",\"slot\":\"08:00\",\"taken\":true}")
                .andExpect(jsonPath("$.intakes[?(@.medicationId == '" + id + "')].taken").value(true));
        json(put("/api/me/medications/" + id + "/intake"), lea, "{\"day\":\"" + today + "\",\"slot\":\"09:00\",\"taken\":true}")
                .andExpect(status().isBadRequest());
        json(put("/api/me/medications/" + id + "/intake"), hugo, "{\"day\":\"" + today + "\",\"slot\":\"08:00\",\"taken\":true}")
                .andExpect(status().isNotFound());
        // ticked: the next day's reminder at 08:00 would not go for today
        jdbc.update("delete from medication_reminder");
        pushes.sent.clear();
        reminders.run(today, LocalTime.of(8, 0));
        assertThat(pushes.sent).isEmpty();

        json(put("/api/me/medications/" + id), lea, "{\"name\":\"Levothyrox\",\"dose\":\"100 µg\",\"times\":[\"07:30\"],\"days\":[1,3,5],\"reminders\":true}")
                .andExpect(jsonPath("$.items[0].dose").value("100 µg")).andExpect(jsonPath("$.items[0].days.length()").value(3));
        mvc.perform(delete("/api/me/medications/" + id).with(as(lea)).with(csrf())).andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(get("/api/me/medications").with(as(hugo))).andExpect(jsonPath("$.items.length()").value(0));
    }
}
