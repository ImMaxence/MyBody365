package fr.mbonnici.mybody365;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import fr.mbonnici.mybody365.user.AppUser;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/** Request access → admin approval → invitation link → session; and the life of the links. */
class AccessFlowTest extends AbstractIntegrationTest {

    private AppUser admin;

    @BeforeEach
    void setUp() {
        wipe();
        admin = account("admin@example.com", AppUser.Role.ADMIN);
    }

    @Test
    void anonymousSessionProbeIsAlways200() throws Exception {
        mvc.perform(get("/api/auth/me")).andExpect(status().isOk()).andExpect(jsonPath("$.authenticated").value(false));
    }

    @Test
    void requestApproveRedeem() throws Exception {
        mvc.perform(post("/api/access-requests").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"Lea@Example.com\",\"name\":\"Léa\",\"message\":\"Coucou\",\"kind\":\"NEW_ACCESS\"}"))
                .andExpect(status().isAccepted());
        // the same person again: still one pending request
        mvc.perform(post("/api/access-requests").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"lea@example.com\",\"name\":\"Léa\",\"kind\":\"NEW_ACCESS\"}"))
                .andExpect(status().isAccepted());

        String list = mvc.perform(get("/api/admin/access-requests").with(as(admin)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].email").value("lea@example.com"))
                .andExpect(jsonPath("$[0].existingUser").value(false))
                .andReturn().getResponse().getContentAsString();
        String requestId = JsonPath.read(list, "$[0].id");

        String decision = mvc.perform(post("/api/admin/access-requests/" + requestId + "/approve").with(as(admin)).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.link.kind").value("INVITE"))
                .andExpect(jsonPath("$.user.email").value("lea@example.com"))
                .andReturn().getResponse().getContentAsString();
        String url = JsonPath.read(decision, "$.link.url");
        assertThat(url).startsWith("http://localhost:4300/link#");
        String token = url.substring(url.indexOf('#') + 1);

        // the link opens a session for the new account
        MvcResult redeemed = mvc.perform(post("/api/auth/links/redeem").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + token + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("INVITE"))
                .andExpect(jsonPath("$.account.onboarded").value(false))
                .andReturn();
        Cookie session = redeemed.getResponse().getCookie("MBSESSION");
        assertThat(session).isNotNull();
        // the session cookie is HttpOnly, SameSite=Lax and lasts 90 days (an installed app drops session cookies)
        assertThat(session.isHttpOnly()).isTrue();
        assertThat(session.getMaxAge()).isEqualTo(90 * 24 * 3600);
        assertThat(redeemed.getResponse().getHeaders("Set-Cookie")).anyMatch(h -> h.startsWith("MBSESSION=") && h.contains("SameSite=Lax"));
        mvc.perform(get("/api/auth/me").cookie(session))
                .andExpect(jsonPath("$.authenticated").value(true))
                .andExpect(jsonPath("$.account.email").value("lea@example.com"))
                .andExpect(jsonPath("$.account.admin").value(false));

        // single use
        mvc.perform(post("/api/auth/links/redeem").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + token + "\"}"))
                .andExpect(status().isGone()).andExpect(jsonPath("$.message").value("link_used"));

        // the journal kept the admin's actions
        mvc.perform(get("/api/admin/audit").with(as(admin)))
                .andExpect(jsonPath("$[0].action").value("LINK_CREATED"))
                .andExpect(jsonPath("$[1].action").value("ACCESS_APPROVED"))
                .andExpect(jsonPath("$[2].action").value("USER_CREATED"));
    }

    @Test
    void revokedAndUnknownLinksAreRefused() throws Exception {
        AppUser lea = account("lea@example.com", AppUser.Role.USER);
        String created = mvc.perform(post("/api/admin/users/" + lea.getId() + "/links").with(as(admin)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"RECOVERY\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String url = JsonPath.read(created, "$.url");
        String id = JsonPath.read(created, "$.id");

        mvc.perform(delete("/api/admin/links/" + id).with(as(admin)).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("REVOKED"));
        mvc.perform(post("/api/auth/links/redeem").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + url.substring(url.indexOf('#') + 1) + "\"}"))
                .andExpect(status().isGone()).andExpect(jsonPath("$.message").value("link_revoked"));
        mvc.perform(post("/api/auth/links/redeem").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"not-a-real-token\"}"))
                .andExpect(status().isGone()).andExpect(jsonPath("$.message").value("link_invalid"));
    }

    @Test
    void aNewLinkRevokesThePreviousOne() throws Exception {
        AppUser lea = account("lea@example.com", AppUser.Role.USER);
        String first = mvc.perform(post("/api/admin/users/" + lea.getId() + "/links").with(as(admin)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"RECOVERY\"}"))
                .andReturn().getResponse().getContentAsString();
        mvc.perform(post("/api/admin/users/" + lea.getId() + "/links").with(as(admin)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"RECOVERY\"}"))
                .andExpect(status().isCreated());
        String url = JsonPath.read(first, "$.url");
        mvc.perform(post("/api/auth/links/redeem").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + url.substring(url.indexOf('#') + 1) + "\"}"))
                .andExpect(status().isGone());
    }

    @Test
    void honeypotIsSilentlyDropped() throws Exception {
        mvc.perform(post("/api/access-requests").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"bot@example.com\",\"name\":\"Bot\",\"kind\":\"NEW_ACCESS\",\"website\":\"http://spam\"}"))
                .andExpect(status().isAccepted());
        mvc.perform(get("/api/admin/access-requests").with(as(admin))).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void lostAccessForAnUnknownAddressCannotBeApproved() throws Exception {
        mvc.perform(post("/api/access-requests").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"ghost@example.com\",\"name\":\"Ghost\",\"kind\":\"LOST_ACCESS\"}"))
                .andExpect(status().isAccepted());
        String list = mvc.perform(get("/api/admin/access-requests").with(as(admin))).andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(list, "$[0].id");
        mvc.perform(post("/api/admin/access-requests/" + id + "/approve").with(as(admin)).with(csrf()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("no_account"));
        mvc.perform(post("/api/admin/access-requests/" + id + "/reject").with(as(admin)).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REJECTED"));
    }
}
