package fr.mbonnici.mybody365;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * 1.9: a recipe shown to the friends without its editor, « Plaisir », favourites, what one shares with one's friends
 * (progress, day) with their cheers, and where the foods come from.
 */
class SharingTest extends AbstractIntegrationTest {

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

    /** the notifications leave after the commit, on another thread */
    private void awaitPushes(int n) throws InterruptedException {
        for (int i = 0; i < 50 && pushes.sent.size() < n; i++) {
            Thread.sleep(100);
        }
        Thread.sleep(200);
        assertThat(pushes.sent).hasSize(n);
    }

    private String recipe(AppUser who, String type, String visibility, String name) throws Exception {
        return JsonPath.read(json(post("/api/me/recipes"), who, """
                {"name":"%s","type":"%s","servings":2,"ingredients":[],"manual":{"kcal":200},"visibility":"%s"}"""
                .formatted(name, type, visibility)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    @Test
    void aRecipeIsShownToTheFriendsInOneTapAndAnnouncedOnce() throws Exception {
        befriend(lea, hugo);
        device(hugo, "https://web.push.apple.com/hugo");
        pushes.sent.clear();
        String id = recipe(lea, "LUNCH", "PRIVATE", "Bruschetta");
        mvc.perform(get("/api/recipes/friends").with(as(hugo))).andExpect(jsonPath("$.length()").value(0));

        json(put("/api/me/recipes/" + id + "/visibility"), lea, "{\"visibility\":\"FRIENDS\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.visibility").value("FRIENDS")).andExpect(jsonPath("$.name").value("Bruschetta"))
                .andExpect(jsonPath("$.manualNutrition").value(true));
        mvc.perform(get("/api/recipes/friends").with(as(hugo))).andExpect(jsonPath("$.length()").value(1));
        awaitPushes(1);
        // back to private, then to the friends again: announced once only
        json(put("/api/me/recipes/" + id + "/visibility"), lea, "{\"visibility\":\"PRIVATE\"}").andExpect(status().isOk());
        mvc.perform(get("/api/recipes/friends").with(as(hugo))).andExpect(jsonPath("$.length()").value(0));
        json(put("/api/me/recipes/" + id + "/visibility"), lea, "{\"visibility\":\"FRIENDS\"}").andExpect(status().isOk());
        awaitPushes(1);

        // the community stays the admins', someone else's recipe is not mine to change, nonsense is refused
        json(put("/api/me/recipes/" + id + "/visibility"), lea, "{\"visibility\":\"PUBLIC\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("community_admins_only"));
        json(put("/api/me/recipes/" + id + "/visibility"), hugo, "{\"visibility\":\"PRIVATE\"}").andExpect(status().isNotFound());
        json(put("/api/me/recipes/" + id + "/visibility"), lea, "{\"visibility\":\"EVERYONE\"}").andExpect(status().isBadRequest());
        String mine = recipe(admin, "DESSERT", "PRIVATE", "Tarte");
        json(put("/api/me/recipes/" + mine + "/visibility"), admin, "{\"visibility\":\"PUBLIC\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.shared").value(true));
    }

    @Test
    void plaisirIsAKindOfRecipeOfItsOwn() throws Exception {
        String id = recipe(admin, "TREAT", "PUBLIC", "Paris-Brest");
        mvc.perform(get("/api/recipes/" + id).with(as(lea))).andExpect(jsonPath("$.type").value("TREAT"));
        mvc.perform(get("/api/recipes/community").param("type", "TREAT").with(as(lea))).andExpect(jsonPath("$[*].name", hasItem("Paris-Brest")));
        mvc.perform(get("/api/recipes/community").param("type", "DRINK").with(as(lea)))
                .andExpect(jsonPath("$[*].name", not(hasItem("Paris-Brest"))));
    }

    @Test
    void favouritesKeepWhatTheMemberCanStillSee() throws Exception {
        befriend(lea, hugo);
        String food = JsonPath.read(json(post("/api/me/foods"), lea, "{\"name\":\"Galette de mamie\",\"kcal\":320}").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.id");
        String hugosFood = JsonPath.read(json(post("/api/me/foods"), hugo, "{\"name\":\"Pain d'Hugo\",\"kcal\":250}")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        String friends = recipe(hugo, "LUNCH", "FRIENDS", "Chili d'Hugo");
        String secret = recipe(ines, "LUNCH", "PRIVATE", "Secret d'Inès");

        mvc.perform(put("/api/me/favorites/foods/" + food).with(as(lea)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(put("/api/me/favorites/foods/" + food).with(as(lea)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(put("/api/me/favorites/recipes/" + friends).with(as(lea)).with(csrf())).andExpect(status().isNoContent());
        // what is not mine to see cannot be a favourite
        mvc.perform(put("/api/me/favorites/foods/" + hugosFood).with(as(lea)).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(put("/api/me/favorites/recipes/" + secret).with(as(lea)).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(put("/api/me/favorites/foods/" + UUID.randomUUID()).with(as(lea)).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(get("/api/me/favorites").with(as(lea))).andExpect(jsonPath("$.foods.length()").value(1))
                .andExpect(jsonPath("$.foods[0].name").value("Galette de mamie")).andExpect(jsonPath("$.recipes[0].name").value("Chili d'Hugo"));
        mvc.perform(get("/api/me/favorites").with(as(hugo))).andExpect(jsonPath("$.foods.length()").value(0));

        // no longer shown to me: out of my favourites
        json(put("/api/me/recipes/" + friends + "/visibility"), hugo, "{\"visibility\":\"PRIVATE\"}").andExpect(status().isOk());
        mvc.perform(get("/api/me/favorites").with(as(lea))).andExpect(jsonPath("$.recipes.length()").value(0));
        mvc.perform(delete("/api/me/favorites/foods/" + food).with(as(lea)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/me/favorites").with(as(lea))).andExpect(jsonPath("$.foods.length()").value(0));
    }

    @Test
    void theProgressAndTheDayAreShownToTheFriendsOnlyWithTheirCheers() throws Exception {
        befriend(lea, hugo);
        device(hugo, "https://web.push.apple.com/hugo");
        device(lea, "https://web.push.apple.com/lea");
        json(put("/api/me/profile"), lea, """
                {"sex":"FEMALE","birthDate":"1996-04-12","heightCm":168,"currentWeightKg":80,"goalWeightKg":70,"weeklyRateKg":0.5,
                 "job":"SEATED","sessionsPerWeek":2}""").andExpect(status().isOk());
        json(put("/api/me/logs/" + TrackingService.today()), lea, "{\"weightKg\":78.5}").andExpect(status().isOk());
        pushes.sent.clear();

        // the preview: what the friends would see, nothing saved, no weight unless asked
        json(post("/api/me/posts"), lea, "{\"kind\":\"PROGRESS\",\"preview\":true}").andExpect(status().isOk())
                .andExpect(jsonPath("$.id").doesNotExist()).andExpect(jsonPath("$.data.changeKg").value(-1.5))
                .andExpect(jsonPath("$.data.currentKg").doesNotExist()).andExpect(jsonPath("$.data.losing").value(true));
        mvc.perform(get("/api/me/posts").with(as(lea))).andExpect(jsonPath("$.length()").value(0));
        String post = JsonPath.read(json(post("/api/me/posts"), lea, "{\"kind\":\"PROGRESS\",\"weights\":true}").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.currentKg").value(78.5)).andExpect(jsonPath("$.data.goalKg").value(70.0))
                .andReturn().getResponse().getContentAsString(), "$.id");
        awaitPushes(1);
        assertThat(pushes.sent.getFirst().endpoint().toString()).endsWith("/hugo");
        // shared again the same day: the same post, no second notification
        json(post("/api/me/posts"), lea, "{\"kind\":\"PROGRESS\"}").andExpect(status().isOk()).andExpect(jsonPath("$.id").value(post))
                .andExpect(jsonPath("$.data.currentKg").doesNotExist());
        awaitPushes(1);

        // friends only
        mvc.perform(get("/api/friends/posts").with(as(hugo))).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].author.name").exists()).andExpect(jsonPath("$[0].mine").value(false));
        mvc.perform(get("/api/friends/posts").with(as(ines))).andExpect(jsonPath("$.length()").value(0));

        // « Bravo »: once, the author told once; not one's own, not a stranger's
        mvc.perform(put("/api/friends/posts/" + post + "/cheer").with(as(hugo)).with(csrf())).andExpect(status().isOk())
                .andExpect(jsonPath("$.cheers").value(1)).andExpect(jsonPath("$.cheered").value(true));
        mvc.perform(put("/api/friends/posts/" + post + "/cheer").with(as(hugo)).with(csrf())).andExpect(jsonPath("$.cheers").value(1));
        awaitPushes(2);
        assertThat(pushes.sent.get(1).endpoint().toString()).endsWith("/lea");
        mvc.perform(put("/api/friends/posts/" + post + "/cheer").with(as(lea)).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(put("/api/friends/posts/" + post + "/cheer").with(as(ines)).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(delete("/api/friends/posts/" + post + "/cheer").with(as(hugo)).with(csrf())).andExpect(jsonPath("$.cheers").value(0));

        // the day: what was noted, nothing in the future, nothing empty
        String today = TrackingService.today().toString();
        json(post("/api/me/posts"), lea, "{\"kind\":\"DAY\",\"day\":\"" + today + "\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("nothing_to_share"));
        json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"LUNCH\",\"quick\":{\"name\":\"Croque-monsieur\",\"kcal\":450}}")
                .andExpect(status().isCreated());
        json(post("/api/me/posts"), lea, "{\"kind\":\"DAY\",\"day\":\"" + today + "\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.kcal").value(450)).andExpect(jsonPath("$.data.lines[0].name").value("Croque-monsieur"));
        json(post("/api/me/posts"), lea, "{\"kind\":\"DAY\",\"day\":\"" + TrackingService.today().plusDays(2) + "\"}")
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/friends/posts").with(as(hugo))).andExpect(jsonPath("$.length()").value(2));

        // taken back by its author only
        mvc.perform(delete("/api/me/posts/" + post).with(as(hugo)).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(delete("/api/me/posts/" + post).with(as(lea)).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/friends/posts").with(as(hugo))).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void theSourcesSayWhereTheFoodsComeFrom() throws Exception {
        jdbc.update("delete from food where source = 'CIQUAL' and source_code = '91001'");
        jdbc.update("""
                insert into food (id, source, source_code, source_version, name, search_name, category, kcal)
                values (?, 'CIQUAL', '91001', '2025', 'Pomme test, crue', 'pomme test crue', 'fruits', 54)""", UUID.randomUUID());
        jdbc.update("""
                insert into food (id, source, source_code, name, search_name, kcal) values (?, 'OFF', '3017620422003', 'Pomme test compote',
                'pomme test compote', 80) on conflict do nothing""", UUID.randomUUID());
        mvc.perform(get("/api/foods/sources").with(as(lea))).andExpect(status().isOk())
                .andExpect(jsonPath("$.ciqualFoods").isNumber()).andExpect(jsonPath("$.offProducts").isNumber());
        // « Aliments bruts »: Ciqual and my own foods, never a product
        mvc.perform(get("/api/foods/search").param("q", "pomme test").param("source", "ciqual").with(as(lea)))
                .andExpect(jsonPath("$[*].name", hasItem("Pomme test, crue"))).andExpect(jsonPath("$[*].source", not(hasItem("OFF"))));
    }
}
