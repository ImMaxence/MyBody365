package fr.mbonnici.mybody365;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import fr.mbonnici.mybody365.user.AppUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class SecurityTest extends AbstractIntegrationTest {

    private AppUser admin;
    private AppUser lea;

    @BeforeEach
    void setUp() {
        wipe();
        admin = account("admin@example.com", AppUser.Role.ADMIN);
        lea = account("lea@example.com", AppUser.Role.USER);
    }

    @Test
    void adminApiNeedsTheAdminRole() throws Exception {
        mvc.perform(get("/api/admin/users")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/users").with(as(lea))).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/users").with(as(admin))).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void appApiNeedsASession() throws Exception {
        mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/me").with(as(lea))).andExpect(status().isOk()).andExpect(jsonPath("$.email").value("lea@example.com"));
    }

    @Test
    void writesNeedTheCsrfToken() throws Exception {
        mvc.perform(patch("/api/me").with(as(lea)).contentType(MediaType.APPLICATION_JSON).content("{\"displayName\":\"Léa\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/me").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"Léa\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("Léa"));
    }

    @Test
    void envAdminsAndYourselfCannotBeDemotedOrSuspended() throws Exception {
        AppUser second = account("second-admin@example.com", AppUser.Role.USER);
        // listed in ADMIN_EMAILS: admin whatever the database says
        mvc.perform(get("/api/admin/users").with(as(second))).andExpect(status().isOk());
        mvc.perform(patch("/api/admin/users/" + second.getId()).with(as(admin)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"SUSPENDED\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.message").value("protected_account"));
        mvc.perform(delete("/api/admin/users/" + admin.getId()).with(as(admin)).with(csrf()))
                .andExpect(status().isForbidden());
    }

    @Test
    void aSuspendedAccountLosesAccessAtOnce() throws Exception {
        mvc.perform(patch("/api/admin/users/" + lea.getId()).with(as(admin)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"SUSPENDED\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUSPENDED"));
        mvc.perform(get("/api/me").with(as(lea))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/audit").with(as(admin))).andExpect(jsonPath("$[0].action").value("USER_SUSPENDED"));
    }

    @Test
    void aPromotionAppliesWithoutSigningInAgain() throws Exception {
        mvc.perform(patch("/api/admin/users/" + lea.getId()).with(as(admin)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"ADMIN\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ADMIN"));
        // the request still carries the old USER authorities: UserStateFilter refreshes them from the database
        mvc.perform(get("/api/admin/users").with(as(lea))).andExpect(status().isOk());
    }

    @Test
    void consentNeedsBothBoxes() throws Exception {
        AppUser fresh = userRepository.save(AppUser.create("new@example.com", "New", AppUser.Role.USER));
        mvc.perform(post("/api/me/consent").with(as(fresh)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"adult\":true,\"health\":false}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/me/consent").with(as(fresh)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"adult\":true,\"health\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.onboarded").value(true));
    }

    @Test
    void deletingYourAccountNeedsYourAddress() throws Exception {
        mvc.perform(delete("/api/me").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"confirmEmail\":\"someone@example.com\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(delete("/api/me").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"confirmEmail\":\"LEA@example.com\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/admin/users").with(as(admin))).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void devLoginDoesNotExistByDefault() throws Exception {
        mvc.perform(get("/api/auth/dev-login")).andExpect(status().isNotFound());
        mvc.perform(get("/api/auth/providers")).andExpect(jsonPath("$.devLogin").value(false))
                .andExpect(jsonPath("$.passkey").value(true));
    }

    @Test
    void securityHeadersAreSet() throws Exception {
        mvc.perform(get("/api/auth/me"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"));
    }

    @Test
    void passkeyOptionsAreServedToAnonymousVisitors() throws Exception {
        mvc.perform(post("/webauthn/authenticate/options").with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.rpId").value("localhost"));
        mvc.perform(post("/webauthn/register/options").with(csrf())).andExpect(status().is4xxClientError());
        mvc.perform(post("/webauthn/register/options").with(as(lea)).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.user.name").value("lea@example.com"));
    }
}
