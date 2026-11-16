package fr.mbonnici.mybody365;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import fr.mbonnici.mybody365.push.WebPushCrypto;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.AppUser;
import java.security.interfaces.ECPublicKey;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

/** Friend links, nudges, photos shared one by one, reports and their moderation. */
class FriendsTest extends AbstractIntegrationTest {

    @Autowired
    RecordingPushTransport pushes;

    private AppUser lea;
    private AppUser hugo;
    private AppUser ines;
    private AppUser admin;

    @BeforeEach
    void setUp() {
        wipe();
        lea = account("lea@example.com", AppUser.Role.USER);
        hugo = account("hugo@example.com", AppUser.Role.USER);
        ines = account("ines@example.com", AppUser.Role.USER);
        admin = account("admin@example.com", AppUser.Role.ADMIN);
    }

    private String token(AppUser who) throws Exception {
        String url = JsonPath.read(mvc.perform(post("/api/me/friends/invite").with(as(who)).with(csrf())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.url");
        assertThat(url).contains("/friends/add#");
        return url.substring(url.indexOf('#') + 1);
    }

    private void accept(AppUser who, String token, int expected) throws Exception {
        mvc.perform(post("/api/me/friends/accept").with(as(who)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + token + "\"}")).andExpect(status().is(expected));
    }

    private void befriend(AppUser a, AppUser b) throws Exception {
        accept(b, token(a), 200);
    }

    @Test
    void aLinkMakesTwoMembersFriends() throws Exception {
        String t = token(lea);
        accept(lea, t, 400); // her own link
        accept(hugo, t, 200);
        accept(hugo, t, 409); // already friends
        accept(ines, t, 200); // the link works for several friends
        accept(ines, "x".repeat(32), 400);
        // a new link replaces the old one
        token(lea);
        AppUser zoe = account("zoe@example.com", AppUser.Role.USER);
        accept(zoe, t, 400);

        jdbc.update("insert into body_log (user_id, day, weight_kg) values (?, ?, 70)", hugo.getId(), TrackingService.today());
        mvc.perform(get("/api/me/friends").with(as(lea)))
                .andExpect(jsonPath("$.friends.length()").value(2))
                .andExpect(jsonPath("$.friends[0].name").value("hugo"))
                .andExpect(jsonPath("$.friends[0].streak").value(1))
                .andExpect(jsonPath("$.friends[0].todayDone").value(true));
        mvc.perform(get("/api/me/friends").with(as(hugo))).andExpect(jsonPath("$.friends[0].name").value("lea"));

        mvc.perform(delete("/api/me/friends/" + hugo.getId()).with(as(lea)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/me/friends").with(as(hugo))).andExpect(jsonPath("$.friends.length()").value(0));
    }

    @Test
    void aNudgeReachesTheFriendsPhoneOnceADay() throws Exception {
        befriend(lea, hugo);
        String key = WebPushCrypto.b64(WebPushCrypto.rawPublic((ECPublicKey) WebPushCrypto.newKeyPair().getPublic()));
        mvc.perform(post("/api/me/push/subscriptions").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"endpoint\":\"https://web.push.apple.com/abc\",\"keys\":{\"p256dh\":\"" + key + "\",\"auth\":\""
                        + WebPushCrypto.b64(new byte[16]) + "\"}}")).andExpect(status().isOk());
        pushes.sent.clear();
        mvc.perform(post("/api/me/friends/" + lea.getId() + "/nudge").with(as(hugo)).with(csrf())).andExpect(jsonPath("$.sent").value(1));
        assertThat(pushes.sent).hasSize(1);
        mvc.perform(post("/api/me/friends/" + lea.getId() + "/nudge").with(as(hugo)).with(csrf())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("nudge_too_soon"));
        mvc.perform(post("/api/me/friends/" + lea.getId() + "/nudge").with(as(ines)).with(csrf())).andExpect(status().isForbidden());
    }

    @Test
    void aPhotoIsSharedWithOneFriendAndAReportShowsItToTheAdmins() throws Exception {
        befriend(lea, hugo);
        befriend(lea, ines);
        String photo = JsonPath.read(mvc.perform(multipart("/api/me/photos")
                        .file(new MockMultipartFile("file", "p.jpg", "image/jpeg", PhotoTest.jpegWithSecret())).with(as(lea)).with(csrf()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        String url = "/api/photos/" + photo + "/thumb";
        mvc.perform(get(url).with(as(hugo))).andExpect(status().isNotFound());

        mvc.perform(put("/api/me/photos/" + photo + "/shares/" + hugo.getId()).with(as(lea)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get(url).with(as(hugo))).andExpect(status().isOk());
        mvc.perform(get(url).with(as(ines))).andExpect(status().isNotFound()); // shared with Hugo only
        mvc.perform(get(url).with(as(admin))).andExpect(status().isNotFound());
        mvc.perform(get("/api/me/friends").with(as(hugo))).andExpect(jsonPath("$.sharedWithMe[0].id").value(photo))
                .andExpect(jsonPath("$.friends[0].sharedWithMe").value(1));
        // not to somebody who is not a friend, and only one's own photos
        AppUser zoe = account("zoe@example.com", AppUser.Role.USER);
        mvc.perform(put("/api/me/photos/" + photo + "/shares/" + zoe.getId()).with(as(lea)).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(put("/api/me/photos/" + photo + "/shares/" + ines.getId()).with(as(hugo)).with(csrf())).andExpect(status().isNotFound());

        // reported: the admins see it until they handle it
        String report = "{\"type\":\"PHOTO\",\"targetId\":\"" + photo + "\",\"reason\":\"INAPPROPRIATE\"}";
        mvc.perform(post("/api/reports").with(as(ines)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(report))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/reports").with(as(hugo)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(report))
                .andExpect(status().isNoContent());
        mvc.perform(post("/api/reports").with(as(hugo)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(report))
                .andExpect(status().isConflict());
        mvc.perform(get(url).with(as(admin))).andExpect(status().isOk());
        String id = JsonPath.read(mvc.perform(get("/api/admin/moderation").with(as(admin))).andExpect(jsonPath("$.reports.length()").value(1))
                .andExpect(jsonPath("$.reports[0].ownerName").value("lea")).andReturn().getResponse().getContentAsString(), "$.reports[0].id");
        mvc.perform(post("/api/admin/reports/" + id + "/act").with(as(admin)).with(csrf())).andExpect(jsonPath("$.reports.length()").value(0));
        mvc.perform(get(url).with(as(hugo))).andExpect(status().isNotFound());
        mvc.perform(get(url).with(as(lea))).andExpect(status().isNotFound()); // deleted
    }

    @Test
    void sharesEndWithTheFriendship() throws Exception {
        befriend(lea, hugo);
        String photo = JsonPath.read(mvc.perform(multipart("/api/me/photos")
                        .file(new MockMultipartFile("file", "p.jpg", "image/jpeg", PhotoTest.jpegWithSecret())).with(as(lea)).with(csrf()))
                .andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(put("/api/me/photos/" + photo + "/shares/" + hugo.getId()).with(as(lea)).with(csrf()));
        mvc.perform(delete("/api/me/friends/" + lea.getId()).with(as(hugo)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/photos/" + photo + "/full").with(as(hugo))).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select count(*) from photo_share where photo_id = ?::uuid", Integer.class, photo)).isZero();
        assertThat(UUID.fromString(photo)).isNotNull();
    }

    @Test
    void aReportedRecipeIsHiddenFromTheCommunity() throws Exception {
        String food = JsonPath.read(mvc.perform(post("/api/me/foods").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Pain\",\"kcal\":250}")).andReturn().getResponse().getContentAsString(), "$.id");
        String recipe = JsonPath.read(mvc.perform(post("/api/me/recipes").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Tartine\",\"type\":\"SNACK\",\"servings\":1,\"shared\":true,\"ingredients\":[{\"foodId\":\"" + food
                        + "\",\"grams\":60}]}")).andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(post("/api/reports").with(as(hugo)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"RECIPE\",\"targetId\":\"" + recipe + "\",\"reason\":\"SPAM\",\"comment\":\"pub\"}"))
                .andExpect(status().isNoContent());
        String id = JsonPath.read(mvc.perform(get("/api/admin/moderation").with(as(admin))).andExpect(jsonPath("$.reports[0].title").value("Tartine"))
                .andReturn().getResponse().getContentAsString(), "$.reports[0].id");
        mvc.perform(get("/api/admin/moderation").with(as(lea))).andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/reports/" + id + "/act").with(as(admin)).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/recipes/" + recipe).with(as(hugo))).andExpect(status().isNotFound());
        mvc.perform(post("/api/admin/recipes/" + recipe + "/restore").with(as(admin)).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/recipes/" + recipe).with(as(hugo))).andExpect(status().isOk());
    }
}
