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
        String body = "{\"name\":\"Tartine\",\"type\":\"SNACK\",\"servings\":1,\"shared\":true,\"ingredients\":[{\"foodId\":\"" + food
                + "\",\"grams\":60}]}";
        // the community is published by the admins (1.7): a member is refused, an admin's recipe can still be reported
        mvc.perform(post("/api/me/recipes").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
        jdbc.update("update app_user set role = 'ADMIN' where id = ?", lea.getId());
        String recipe = JsonPath.read(mvc.perform(post("/api/me/recipes").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(post("/api/reports").with(as(hugo)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"RECIPE\",\"targetId\":\"" + recipe + "\",\"reason\":\"SPAM\",\"comment\":\"pub\"}"))
                .andExpect(status().isNoContent());
        String id = JsonPath.read(mvc.perform(get("/api/admin/moderation").with(as(admin))).andExpect(jsonPath("$.reports[0].title").value("Tartine"))
                .andReturn().getResponse().getContentAsString(), "$.reports[0].id");
        mvc.perform(get("/api/admin/moderation").with(as(hugo))).andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/reports/" + id + "/act").with(as(admin)).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/recipes/" + recipe).with(as(hugo))).andExpect(status().isNotFound());
        mvc.perform(post("/api/admin/recipes/" + recipe + "/restore").with(as(admin)).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/recipes/" + recipe).with(as(hugo))).andExpect(status().isOk());
    }

    private void device(AppUser who, String endpoint) throws Exception {
        String key = WebPushCrypto.b64(WebPushCrypto.rawPublic((ECPublicKey) WebPushCrypto.newKeyPair().getPublic()));
        mvc.perform(post("/api/me/push/subscriptions").with(as(who)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"endpoint\":\"" + endpoint + "\",\"keys\":{\"p256dh\":\"" + key + "\",\"auth\":\""
                        + WebPushCrypto.b64(new byte[16]) + "\"}}")).andExpect(status().isOk());
    }

    private String recipe(String visibility, String name) {
        return """
                {"name":"%s","type":"SNACK","servings":2,"ingredients":[],"manual":{"kcal":200},"visibility":"%s"}"""
                .formatted(name, visibility);
    }

    /** the notifications leave after the commit, on another thread */
    private void awaitPushes(int n) throws InterruptedException {
        for (int i = 0; i < 50 && pushes.sent.size() < n; i++) {
            Thread.sleep(100);
        }
        Thread.sleep(200);
        assertThat(pushes.sent).hasSize(n);
    }

    @Test
    void aRecipeShownToFriendsIsAnnouncedToThemOnce() throws Exception {
        befriend(lea, hugo);
        befriend(lea, ines);
        device(hugo, "https://web.push.apple.com/hugo");
        device(ines, "https://web.push.apple.com/ines");
        // Inès turned the friends' notifications off
        jdbc.update("insert into notification_pref (user_id, friends_enabled) values (?, false) on conflict (user_id) do update set friends_enabled = false",
                ines.getId());
        pushes.sent.clear();

        // private: nobody hears of it
        String id = JsonPath.read(mvc.perform(post("/api/me/recipes").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(recipe("PRIVATE", "Bruschetta"))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        awaitPushes(0);
        // shown to friends: Hugo's phone rings, not Inès's
        mvc.perform(put("/api/me/recipes/" + id).with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(recipe("FRIENDS", "Bruschetta"))).andExpect(status().isOk());
        awaitPushes(1);
        assertThat(pushes.sent.getFirst().endpoint().toString()).endsWith("/hugo");
        // once per recipe
        mvc.perform(put("/api/me/recipes/" + id).with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(recipe("FRIENDS", "Bruschetta maison"))).andExpect(status().isOk());
        awaitPushes(1);
        // and one an hour at most: the next one shows in the friends' tab only
        mvc.perform(post("/api/me/recipes").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(recipe("FRIENDS", "Houmous"))).andExpect(status().isCreated());
        awaitPushes(1);
        mvc.perform(get("/api/recipes/friends").with(as(hugo))).andExpect(jsonPath("$.length()").value(2));

        // an hour later, a new recipe is announced again
        jdbc.update("update recipe set announced_at = announced_at - interval '2 hours'");
        mvc.perform(post("/api/me/recipes").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(recipe("FRIENDS", "Tzatziki"))).andExpect(status().isCreated());
        awaitPushes(2);
    }

    private org.springframework.test.web.servlet.ResultActions send(AppUser from, String recipe, AppUser... to) throws Exception {
        String ids = java.util.Arrays.stream(to).map(u -> "\"" + u.getId() + "\"").collect(java.util.stream.Collectors.joining(","));
        return mvc.perform(post("/api/me/recipes/" + recipe + "/send").with(as(from)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"to\":[" + ids + "]}"));
    }

    /** 1.19: a recipe sent to a friend from its page: a notification that opens it in their app, only where they may open it */
    @Test
    void aRecipeSentToAFriendOpensInTheirApp() throws Exception {
        befriend(lea, hugo);
        befriend(hugo, ines);
        device(hugo, "https://web.push.apple.com/hugo");
        String id = JsonPath.read(mvc.perform(post("/api/me/recipes").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(recipe("PRIVATE", "Tarte fine"))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        pushes.sent.clear();

        // only for her: nothing leaves
        send(lea, id, hugo).andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("recipe_private"));
        // shown to her friends (already announced, so that only the sending rings): Hugo is told, the centre keeps it
        jdbc.update("update recipe set visibility = 'FRIENDS', announced_at = now() where id = ?::uuid", id);
        send(lea, id, hugo).andExpect(status().isOk()).andExpect(jsonPath("$.sent").value(1));
        awaitPushes(1);
        assertThat(pushes.sent.getFirst().endpoint().toString()).endsWith("/hugo");
        assertThat(jdbc.queryForObject("select url from notification_log where user_id = ? and kind = 'RECIPE_SENT'", String.class, hugo.getId()))
                .isEqualTo("/app/meals/recipes/" + id);
        assertThat(jdbc.queryForObject("select title from notification_log where user_id = ? and kind = 'RECIPE_SENT'", String.class, hugo.getId()))
                .isEqualTo("lea t’envoie une recette 🍳");
        // a second tap within 10 minutes: said sent, nothing leaves again
        send(lea, id, hugo).andExpect(status().isOk()).andExpect(jsonPath("$.sent").value(1));
        awaitPushes(1);

        // not a friend: refused; a friend of Hugo's who is not Léa's cannot open her recipe: Hugo cannot send it there
        send(lea, id, ines).andExpect(status().isForbidden()).andExpect(jsonPath("$.message").value("not_friends"));
        send(hugo, id, ines).andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("recipe_not_visible"));
        // nobody, or a recipe one cannot open
        send(lea, id).andExpect(status().isBadRequest());
        send(ines, id, hugo).andExpect(status().isNotFound());
    }
}
