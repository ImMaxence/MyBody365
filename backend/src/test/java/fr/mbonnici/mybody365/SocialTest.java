package fr.mbonnici.mybody365;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import fr.mbonnici.mybody365.user.AppUser;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** 0.8: usernames, friend requests, recipes for friends, a profile picture of one's own. */
class SocialTest extends AbstractIntegrationTest {

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

    private ResultActions json(MockHttpServletRequestBuilder req, AppUser who, String body) throws Exception {
        return mvc.perform(req.with(as(who)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private String relation(AppUser from, String username) throws Exception {
        return JsonPath.read(json(post("/api/me/friends/requests"), from, "{\"username\":\"" + username + "\"}").andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.relation");
    }

    @Test
    void everyAccountGetsAUniqueUsernameItCanChange() throws Exception {
        AppUser a = userRepository.save(AppUser.create("lm1@example.com", "Léa Martin", AppUser.Role.USER));
        AppUser b = userRepository.save(AppUser.create("lm2@example.com", "Lea Martin", AppUser.Role.USER));
        AppUser c = userRepository.save(AppUser.create("al@example.com", "Al", AppUser.Role.USER));
        assertThat(a.getUsername()).isEqualTo("leamartin");
        assertThat(b.getUsername()).isEqualTo("leamartin_2");
        assertThat(c.getUsername()).isEqualTo("alfit");

        mvc.perform(get("/api/me").with(as(lea))).andExpect(jsonPath("$.username").value("lea"));
        json(put("/api/me/username"), lea, "{\"username\":\"a\"}").andExpect(status().isBadRequest());
        json(put("/api/me/username"), lea, "{\"username\":\"lea..fit\"}").andExpect(status().isBadRequest());
        json(put("/api/me/username"), lea, "{\"username\":\"Hugo\"}").andExpect(status().isConflict());
        json(put("/api/me/username"), lea, "{\"username\":\"my_body.365\"}").andExpect(status().isConflict());
        json(put("/api/me/username"), lea, "{\"username\":\"@Lea.Fit\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("lea.fit"));
        mvc.perform(get("/api/me").with(as(lea))).andExpect(jsonPath("$.username").value("lea.fit"));
    }

    @Test
    void aRequestByUsernameMakesFriendsOnceAccepted() throws Exception {
        // an exact username only, never a list
        mvc.perform(get("/api/me/friends/search").param("username", "@LEA").with(as(hugo))).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("lea"))
                .andExpect(jsonPath("$.relation").value("NONE"))
                .andExpect(jsonPath("$.avatarUrl").doesNotExist());
        mvc.perform(get("/api/me/friends/search").param("username", "le").with(as(hugo))).andExpect(status().isNotFound());
        mvc.perform(get("/api/me/friends/search").param("username", "nobody_here").with(as(hugo))).andExpect(status().isNotFound());

        json(post("/api/me/friends/requests"), hugo, "{\"username\":\"hugo\"}").andExpect(status().isBadRequest());
        assertThat(relation(hugo, "lea")).isEqualTo("SENT");
        assertThat(relation(hugo, "lea")).isEqualTo("SENT"); // asking twice changes nothing
        mvc.perform(get("/api/me/friends/requests").with(as(lea)))
                .andExpect(jsonPath("$.received.length()").value(1))
                .andExpect(jsonPath("$.received[0].username").value("hugo"))
                .andExpect(jsonPath("$.received[0].avatarUrl").doesNotExist()) // no picture of his own, none from Google
                .andExpect(jsonPath("$.sent.length()").value(0));
        mvc.perform(get("/api/me/friends/requests").with(as(hugo))).andExpect(jsonPath("$.sent[0].username").value("lea"));
        mvc.perform(get("/api/me/friends/search").param("username", "hugo").with(as(lea))).andExpect(jsonPath("$.relation").value("RECEIVED"));

        // accepted: friends both ways, the request gone
        mvc.perform(post("/api/me/friends/requests/" + hugo.getId() + "/accept").with(as(lea)).with(csrf())).andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("hugo"));
        mvc.perform(get("/api/me/friends").with(as(hugo))).andExpect(jsonPath("$.friends[0].username").value("lea"));
        mvc.perform(get("/api/me/friends/requests").with(as(lea))).andExpect(jsonPath("$.received.length()").value(0));
        json(post("/api/me/friends/requests"), hugo, "{\"username\":\"lea\"}").andExpect(status().isConflict());
        mvc.perform(post("/api/me/friends/requests/" + hugo.getId() + "/accept").with(as(lea)).with(csrf())).andExpect(status().isNotFound());

        // two members asking each other: friends at once
        assertThat(relation(ines, "lea")).isEqualTo("SENT");
        assertThat(relation(lea, "ines")).isEqualTo("FRIEND");

        // declined by the one asked, withdrawn by the one asking
        AppUser zoe = account("zoe@example.com", AppUser.Role.USER);
        assertThat(relation(zoe, "hugo")).isEqualTo("SENT");
        mvc.perform(delete("/api/me/friends/requests/" + zoe.getId()).with(as(hugo)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/me/friends/requests").with(as(zoe))).andExpect(jsonPath("$.sent.length()").value(0));
        assertThat(relation(zoe, "ines")).isEqualTo("SENT");
        mvc.perform(delete("/api/me/friends/requests/" + ines.getId()).with(as(zoe)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(delete("/api/me/friends/requests/" + ines.getId()).with(as(zoe)).with(csrf())).andExpect(status().isNotFound());
    }

    @Test
    void suggestionsWhileTypingAUsername() throws Exception {
        AppUser leaM = userRepository.save(AppUser.create("lm@example.com", "Léa Martin", AppUser.Role.USER));
        mvc.perform(get("/api/me/friends/suggest").param("q", "le").with(as(hugo))).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/me/friends/suggest").param("q", "@LEA").with(as(hugo)))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].username").value("lea"))
                .andExpect(jsonPath("$[1].username").value("leamartin"))
                .andExpect(jsonPath("$[0].avatarUrl").doesNotExist());
        // "_" is a letter here, not a wildcard
        mvc.perform(get("/api/me/friends/suggest").param("q", "l_a").with(as(hugo))).andExpect(jsonPath("$.length()").value(0));
        // never oneself
        mvc.perform(get("/api/me/friends/suggest").param("q", "hug").with(as(hugo))).andExpect(jsonPath("$.length()").value(0));
        // out of the suggestions on request, still found with the exact username
        json(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/me"), leaM, "{\"discoverable\":false}")
                .andExpect(jsonPath("$.discoverable").value(false));
        mvc.perform(get("/api/me/friends/suggest").param("q", "lea").with(as(hugo))).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/me/friends/search").param("username", "leamartin").with(as(hugo))).andExpect(status().isOk());
    }

    @Test
    void aRecipeCanBeShownToFriendsOnly() throws Exception {
        String food = JsonPath.read(json(post("/api/me/foods"), lea, """
                {"name":"Galette de mamie","kcal":320,"proteinG":7,"carbsG":40,"fatG":14}""").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.id");
        String id = JsonPath.read(json(post("/api/me/recipes"), lea, """
                {"name":"Galettes du dimanche","type":"BREAKFAST","servings":2,"visibility":"FRIENDS",
                 "ingredients":[{"foodId":"%s","grams":200}]}""".formatted(food)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.visibility").value("FRIENDS"))
                .andExpect(jsonPath("$.shared").value(false))
                .andReturn().getResponse().getContentAsString(), "$.id");
        assertThat(relation(hugo, "lea")).isEqualTo("SENT");
        mvc.perform(post("/api/me/friends/requests/" + hugo.getId() + "/accept").with(as(lea)).with(csrf())).andExpect(status().isOk());

        mvc.perform(get("/api/recipes/friends").with(as(hugo))).andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].author").value("lea"));
        mvc.perform(get("/api/recipes/friends").param("type", "DINNER").with(as(hugo))).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/recipes/" + id).with(as(hugo))).andExpect(status().isOk());
        mvc.perform(get("/api/recipes/" + id).with(as(ines))).andExpect(status().isNotFound());
        mvc.perform(get("/api/recipes/friends").with(as(ines))).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/recipes/community").with(as(ines))).andExpect(jsonPath("$[*].id", not(hasItem(id))));
        // a friend may copy it, not vote on it (votes are for the community)
        mvc.perform(post("/api/recipes/" + id + "/copy").with(as(hugo)).with(csrf())).andExpect(status().isCreated());

        // the older "shared" flag still means the community
        json(put("/api/me/recipes/" + id), lea, """
                {"name":"Galettes du dimanche","type":"BREAKFAST","servings":2,"shared":true,
                 "ingredients":[{"foodId":"%s","grams":200}]}""".formatted(food))
                .andExpect(jsonPath("$.visibility").value("PUBLIC")).andExpect(jsonPath("$.shared").value(true));
        mvc.perform(get("/api/recipes/community").with(as(ines))).andExpect(jsonPath("$[*].id", hasItem(id)));
        // back to private: out of everybody's reach
        json(put("/api/me/recipes/" + id), lea, """
                {"name":"Galettes du dimanche","type":"BREAKFAST","servings":2,"visibility":"PRIVATE",
                 "ingredients":[{"foodId":"%s","grams":200}]}""".formatted(food)).andExpect(jsonPath("$.shared").value(false));
        mvc.perform(get("/api/recipes/" + id).with(as(hugo))).andExpect(status().isNotFound());
    }

    private static byte[] png(int w, int h) throws Exception {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(new Color(255, 120, 40));
        g.fillRect(0, 0, w, h);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    private ResultActions uploadAvatar(AppUser who, byte[] bytes) throws Exception {
        return mvc.perform(multipart("/api/me/avatar").file(new MockMultipartFile("file", "me.png", "image/png", bytes)).with(as(who))
                .with(csrf()));
    }

    @Test
    void anOwnPictureIsSquareReplacedAndSeenByFriendsOnly() throws Exception {
        String first = JsonPath.read(uploadAvatar(lea, png(900, 600)).andExpect(status().isOk())
                .andExpect(jsonPath("$.ownAvatar").value(true))
                .andExpect(jsonPath("$.avatarUrl", startsWith("/api/users/" + lea.getId() + "/avatar?v="))).andReturn().getResponse()
                .getContentAsString(), "$.avatarUrl");
        byte[] stored = mvc.perform(get(first).with(as(lea))).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        BufferedImage square = ImageIO.read(new java.io.ByteArrayInputStream(stored));
        if (square != null) { // WebP can only be read back with a WebP plugin
            assertThat(square.getWidth()).isEqualTo(square.getHeight());
        }
        mvc.perform(get("/api/me/storage").with(as(lea))).andExpect(jsonPath("$.usedBytes").value(stored.length));

        // friends, who I asked, and admins see it; nobody else
        mvc.perform(get(first).with(as(hugo))).andExpect(status().isNotFound());
        assertThat(relation(lea, "hugo")).isEqualTo("SENT");
        mvc.perform(get(first).with(as(hugo))).andExpect(status().isOk());
        mvc.perform(get("/api/me/friends/requests").with(as(hugo))).andExpect(jsonPath("$.received[0].avatarUrl").value(first));
        mvc.perform(get(first).with(as(ines))).andExpect(status().isNotFound());
        mvc.perform(get(first).with(as(admin))).andExpect(status().isOk());

        // a new one replaces the old one, which is gone
        String second = JsonPath.read(uploadAvatar(lea, png(400, 400)).andReturn().getResponse().getContentAsString(), "$.avatarUrl");
        assertThat(version(second)).isNotEqualTo(version(first));
        mvc.perform(get(first).with(as(lea))).andExpect(status().isNotFound());
        mvc.perform(get(second).with(as(lea))).andExpect(status().isOk());

        uploadAvatar(lea, "not a picture at all, sorry".getBytes()).andExpect(status().isBadRequest());
        mvc.perform(delete("/api/me/avatar").with(as(lea)).with(csrf())).andExpect(status().isOk())
                .andExpect(jsonPath("$.ownAvatar").value(false));
        mvc.perform(get(second).with(as(lea))).andExpect(status().isNotFound());
        mvc.perform(get("/api/me/storage").with(as(lea))).andExpect(jsonPath("$.usedBytes").value(0));

        // a new picture after a removal never takes an address used before (the phone would show the old one, kept a year)
        String third = JsonPath.read(uploadAvatar(lea, png(300, 300)).andReturn().getResponse().getContentAsString(), "$.avatarUrl");
        assertThat(version(third)).isNotEqualTo(version(second)).isNotEqualTo(version(first));
        mvc.perform(get(third).with(as(lea))).andExpect(status().isOk());
    }

    private static int version(String avatarUrl) {
        return Integer.parseInt(avatarUrl.substring(avatarUrl.indexOf("?v=") + 3));
    }

    @org.springframework.beans.factory.annotation.Autowired
    fr.mbonnici.mybody365.user.AvatarCleanup avatarCleanup;

    @org.springframework.beans.factory.annotation.Autowired
    fr.mbonnici.mybody365.storage.ObjectStorage storage;

    @Test
    void theGooglePicturesAreGoneTheInitialShows() throws Exception {
        // a Google address is never shown
        jdbc.update("update app_user set avatar_url = 'https://lh3.googleusercontent.com/a/x', avatar_version = null where id = ?", lea.getId());
        mvc.perform(get("/api/auth/me").with(as(lea))).andExpect(jsonPath("$.account.avatarUrl").doesNotExist());

        // the copies V16 put aside leave the bucket
        String key = "u/" + lea.getId() + "/avatar_1";
        storage.put(key, new byte[] {1, 2, 3}, "image/webp");
        jdbc.update("insert into avatar_cleanup (user_id, version) values (?, 1)", lea.getId());
        assertThat(avatarCleanup.clean(10)).isEqualTo(1);
        assertThat(storage.get(key)).isNull();
        assertThat(jdbc.queryForObject("select count(*) from avatar_cleanup", Integer.class)).isZero();
    }
}
