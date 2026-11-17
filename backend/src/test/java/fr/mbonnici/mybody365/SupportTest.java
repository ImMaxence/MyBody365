package fr.mbonnici.mybody365;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import fr.mbonnici.mybody365.push.WebPushCrypto;
import fr.mbonnici.mybody365.user.AppUser;
import java.security.interfaces.ECPublicKey;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

/** A word to the creator, the error journal, both lists for the admins, and the red dots of the app. */
class SupportTest extends AbstractIntegrationTest {

    @Autowired
    RecordingPushTransport pushes;

    private AppUser admin;
    private AppUser lea;

    @BeforeEach
    void setUp() {
        wipe();
        jdbc.update("delete from feedback");
        jdbc.update("delete from error_log");
        admin = account("admin@example.com", AppUser.Role.ADMIN);
        lea = account("lea@example.com", AppUser.Role.USER);
    }

    @Test
    void feedbackReachesTheAdmins() throws Exception {
        String key = WebPushCrypto.b64(WebPushCrypto.rawPublic((ECPublicKey) WebPushCrypto.newKeyPair().getPublic()));
        mvc.perform(post("/api/me/push/subscriptions").with(as(admin)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"endpoint\":\"https://fcm.googleapis.com/fcm/send/admin\",\"keys\":{\"p256dh\":\"" + key + "\",\"auth\":\""
                        + WebPushCrypto.b64(new byte[16]) + "\"}}")).andExpect(status().isOk());
        pushes.sent.clear();

        mvc.perform(post("/api/me/feedback").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"kind\":\"BUG\",\"message\":\"  ok  \"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/me/feedback").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"kind\":\"NOPE\",\"message\":\"Le bouton ne marche pas\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/me/feedback").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"kind\":\"BUG\",\"message\":\"Le graphique ne s'affiche pas\",\"version\":\"1.2.0\"}"))
                .andExpect(status().isNoContent());
        // the admin's phone hears about it
        assertThat(pushes.sent).hasSize(1);

        // members never see the list
        mvc.perform(get("/api/admin/feedback").with(as(lea))).andExpect(status().isForbidden());
        String id = JsonPath.read(mvc.perform(get("/api/admin/feedback").with(as(admin))).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].kind").value("BUG")).andExpect(jsonPath("$[0].userEmail").value("lea@example.com"))
                .andExpect(jsonPath("$[0].appVersion").value("1.2.0")).andReturn().getResponse().getContentAsString(), "$[0].id");
        mvc.perform(get("/api/me/todo").with(as(admin))).andExpect(jsonPath("$.adminFeedback").value(1));
        mvc.perform(post("/api/admin/feedback/" + id + "/archive").with(as(admin)).with(csrf())).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/admin/feedback").with(as(admin)).param("archived", "true")).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/admin/summary").with(as(admin))).andExpect(jsonPath("$.openFeedback").value(0));
    }

    @Test
    void errorsAreCountedOnceAndArchived() throws Exception {
        // a phone, signed in or not; the same error twice (numbers aside) is one line
        mvc.perform(post("/api/errors").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"TypeError: x is undefined at item 12\",\"detail\":\"at a (main.js:1)\",\"path\":\"/app/login\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(post("/api/errors").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"TypeError: x is undefined at item 13\",\"detail\":\"at a (main.js:1)\",\"path\":\"/app\",\"version\":\"1.2.0\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(post("/api/errors").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"" + "x".repeat(5000) + "\"}")).andExpect(status().isBadRequest());

        mvc.perform(get("/api/admin/errors").with(as(lea))).andExpect(status().isForbidden());
        String id = JsonPath.read(mvc.perform(get("/api/admin/errors").with(as(admin)))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].occurrences").value(2))
                .andExpect(jsonPath("$[0].source").value("APP"))
                .andExpect(jsonPath("$[0].userName").value("lea"))
                .andReturn().getResponse().getContentAsString(), "$[0].id");
        mvc.perform(get("/api/admin/summary").with(as(admin))).andExpect(jsonPath("$.openErrors").value(1));

        mvc.perform(post("/api/admin/errors/" + id + "/archive").with(as(admin)).with(csrf())).andExpect(jsonPath("$.length()").value(0));
        // once archived, the same error opens a new line
        mvc.perform(post("/api/errors").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"TypeError: x is undefined at item 14\",\"detail\":\"at a (main.js:1)\"}")).andExpect(status().isNoContent());
        mvc.perform(get("/api/admin/errors").with(as(admin))).andExpect(jsonPath("$[0].occurrences").value(1));
        mvc.perform(post("/api/admin/errors/archive-all").with(as(admin)).with(csrf())).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/admin/errors").with(as(admin)).param("archived", "true")).andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void theRedDots() throws Exception {
        // no passkey yet; Google Drive is not configured in the tests, so no dot for it
        mvc.perform(get("/api/me/todo").with(as(lea)))
                .andExpect(jsonPath("$.passkey").value(true))
                .andExpect(jsonPath("$.drive").value(false))
                .andExpect(jsonPath("$.adminErrors").value(0));
        jdbc.update("insert into user_entities (id, name, display_name) values ('dXNlcg', ?, 'Léa')", lea.getEmail());
        jdbc.update("""
                insert into user_credentials (credential_id, user_entity_user_id, public_key, signature_count, backup_eligible, backup_state,
                  created, label)
                values ('Y3JlZA', 'dXNlcg', '\\x00'::bytea, 0, true, true, now(), 'iPhone')""");
        mvc.perform(get("/api/me/todo").with(as(lea))).andExpect(jsonPath("$.passkey").value(false));
    }
}
