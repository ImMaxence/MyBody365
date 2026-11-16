package fr.mbonnici.mybody365;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.AppUser;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;

/** Export, preview of the differences, merge, full replace into another account, hostile files. */
class BackupTest extends AbstractIntegrationTest {

    private AppUser lea;
    private AppUser hugo;
    private final LocalDate today = TrackingService.today();

    @BeforeEach
    void setUp() throws Exception {
        wipe();
        lea = account("lea@example.com", AppUser.Role.USER);
        hugo = account("hugo@example.com", AppUser.Role.USER);
        json(put("/api/me/profile"), lea, """
                {"sex":"FEMALE","birthDate":"1996-04-12","heightCm":168,"activityLevel":"LIGHT",
                 "currentWeightKg":78.4,"goalWeightKg":68,"weeklyRateKg":0.5}""");
        json(put("/api/me/logs/" + today.minusDays(1)), lea, "{\"weightKg\":78.9,\"waistCm\":90}");
        String food = JsonPath.read(json(post("/api/me/foods"), lea, "{\"name\":\"Galette maison\",\"kcal\":320,\"servingG\":120}")
                .getResponse().getContentAsString(), "$.id");
        String recipe = JsonPath.read(json(post("/api/me/recipes"), lea, """
                {"name":"Galettes du dimanche","type":"DESSERT","servings":2,"ingredients":[{"foodId":"%s","grams":300}]}""".formatted(food))
                .getResponse().getContentAsString(), "$.id");
        mvc.perform(multipart("/api/me/recipes/" + recipe + "/image")
                .file(new MockMultipartFile("file", "r.jpg", "image/jpeg", PhotoTest.jpegWithSecret())).with(as(lea)).with(csrf()));
        json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"DINNER\",\"recipeId\":\"" + recipe + "\",\"servings\":1}");
        json(post("/api/me/meals"), lea, "{\"day\":\"" + today + "\",\"slot\":\"LUNCH\",\"foodId\":\"" + food + "\",\"grams\":150}");
        mvc.perform(multipart("/api/me/photos").file(new MockMultipartFile("file", "p.jpg", "image/jpeg", PhotoTest.jpegWithSecret()))
                .param("pose", "SIDE").with(as(lea)).with(csrf())).andExpect(status().isCreated());
        json(post("/api/me/workouts"), lea, """
                {"day":"%s","program":"home","workout":"circuit","durationMin":25,"exercises":[{"id":"plank","sets":4}]}""".formatted(today));
        json(put("/api/me/water/" + today), lea, "{\"glasses\":6}");
        json(post("/api/me/timers"), lea, "{\"name\":\"Tabata maison\",\"work\":20,\"rest\":10,\"rounds\":8}");
    }

    private MvcResult json(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req, AppUser who, String body)
            throws Exception {
        return mvc.perform(req.with(as(who)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)).andReturn();
    }

    private byte[] export(AppUser who) throws Exception {
        MvcResult started = mvc.perform(get("/api/me/backup/export").with(as(who))).andExpect(request().asyncStarted()).andReturn();
        MvcResult done = mvc.perform(asyncDispatch(started)).andExpect(status().isOk()).andReturn();
        assertThat(done.getResponse().getHeader("Content-Disposition")).contains("attachment").contains(".zip");
        return done.getResponse().getContentAsByteArray();
    }

    private String preview(AppUser who, byte[] zip) throws Exception {
        return mvc.perform(multipart("/api/me/backup/preview").file(new MockMultipartFile("file", "b.zip", "application/zip", zip))
                .with(as(who)).with(csrf())).andReturn().getResponse().getContentAsString();
    }

    private static List<String> entries(byte[] zip) throws Exception {
        List<String> names = new ArrayList<>();
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip))) {
            for (ZipEntry e; (e = in.getNextEntry()) != null;) {
                names.add(e.getName());
            }
        }
        return names;
    }

    @Test
    void anExportHoldsEverythingAndMergingItBackOnlyTouchesWhatDiffers() throws Exception {
        byte[] zip = export(lea);
        List<String> names = entries(zip);
        assertThat(names).contains("manifest.json", "data.json");
        assertThat(names.stream().filter(n -> n.startsWith("photos/"))).hasSize(2);
        assertThat(names.stream().filter(n -> n.startsWith("recipes/"))).hasSize(2);

        // the same day changes, another disappears, a new one appears
        json(put("/api/me/logs/" + today.minusDays(1)), lea, "{\"weightKg\":77.0}");
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/me/logs/" + today).with(as(lea)).with(csrf()));
        json(put("/api/me/logs/" + today.minusDays(5)), lea, "{\"weightKg\":80.1}");
        String p = preview(lea, zip);
        assertThat((Integer) JsonPath.read(p, "$.changes.logs.added")).isEqualTo(1);
        assertThat((Integer) JsonPath.read(p, "$.changes.logs.changed")).isEqualTo(1);
        assertThat((Integer) JsonPath.read(p, "$.changes.logs.removed")).isEqualTo(1);
        assertThat((Integer) JsonPath.read(p, "$.changes.photos.same")).isEqualTo(1);
        assertThat((Integer) JsonPath.read(p, "$.changes.recipes.same")).isEqualTo(1);
        assertThat((Boolean) JsonPath.read(p, "$.profile")).isTrue();
        String token = JsonPath.read(p, "$.token");

        // somebody else cannot use the preview
        json(post("/api/me/backup/restore"), hugo, "{\"token\":\"" + token + "\",\"mode\":\"MERGE\"}");
        mvc.perform(post("/api/me/backup/restore").with(as(hugo)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + token + "\",\"mode\":\"MERGE\"}")).andExpect(jsonPath("$.message").value("restore_expired"));

        mvc.perform(post("/api/me/backup/restore").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + token + "\",\"mode\":\"MERGE\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.logs").value(2));
        // merged: the backup won on its days, the newer day stayed
        mvc.perform(get("/api/me/logs").with(as(lea))).andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[?(@.day == '" + today.minusDays(1) + "')].weightKg").value(78.9));
        mvc.perform(get("/api/me/photos").with(as(lea))).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/me/recipes").with(as(lea))).andExpect(jsonPath("$.length()").value(1));
        // a preview is used once
        mvc.perform(post("/api/me/backup/restore").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + token + "\",\"mode\":\"MERGE\"}")).andExpect(status().isBadRequest());
    }

    @Test
    void aBackupReplacesEverythingInAnotherAccount() throws Exception {
        byte[] zip = export(lea);
        String token = JsonPath.read(preview(hugo, zip), "$.token");
        mvc.perform(post("/api/me/backup/restore").with(as(hugo)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + token + "\",\"mode\":\"REPLACE\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.photos").value(1)).andExpect(jsonPath("$.recipes").value(1))
                .andExpect(jsonPath("$.meals").value(2)).andExpect(jsonPath("$.workouts").value(1)).andExpect(jsonPath("$.water").value(1))
                .andExpect(jsonPath("$.timers").value(1));
        mvc.perform(get("/api/me/water/" + today).with(as(hugo))).andExpect(jsonPath("$.glasses").value(6));
        String photo = JsonPath.read(mvc.perform(get("/api/me/photos").with(as(hugo))).andReturn().getResponse().getContentAsString(), "$[0].url");
        mvc.perform(get(photo).with(as(hugo))).andExpect(status().isOk());
        String recipe = JsonPath.read(mvc.perform(get("/api/me/recipes").with(as(hugo))).andReturn().getResponse().getContentAsString(), "$[0].id");
        mvc.perform(get("/api/recipes/" + recipe).with(as(hugo))).andExpect(jsonPath("$.shared").value(false))
                .andExpect(jsonPath("$.ingredients.length()").value(1));
        mvc.perform(get("/api/recipes/" + recipe + "/image/full").with(as(hugo))).andExpect(status().isOk());
        // meals point to Hugo's own copies
        String day = mvc.perform(get("/api/me/meals").param("day", today.toString()).with(as(hugo))).andReturn().getResponse()
                .getContentAsString();
        assertThat(day).contains(recipe);
        mvc.perform(get("/api/me/summary").with(as(hugo))).andExpect(status().isOk());
    }

    @Test
    void hostileOrForeignFilesAreRefused() throws Exception {
        assertThat(preview(lea, "not a zip".getBytes(StandardCharsets.UTF_8))).contains("backup_invalid");

        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bos)) {
            zip.putNextEntry(new ZipEntry("manifest.json"));
            zip.write("{\"format\":\"something-else\",\"version\":1}".getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("data.json"));
            zip.write("{}".getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        assertThat(preview(lea, bos.toByteArray())).contains("backup_invalid");

        // a path that tries to leave its folder is never read
        bos = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bos)) {
            zip.putNextEntry(new ZipEntry("manifest.json"));
            zip.write("{\"format\":\"mybody365-backup\",\"version\":1}".getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("data.json"));
            zip.write("{\"logs\":[{\"day\":\"2020-01-01\",\"weight_kg\":70,\"user_id\":\"00000000-0000-0000-0000-000000000000\"}]}"
                    .getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("../../etc/passwd"));
            zip.write("x".getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        String p = preview(lea, bos.toByteArray());
        assertThat((Integer) JsonPath.read(p, "$.changes.logs.added")).isEqualTo(1);
        mvc.perform(post("/api/me/backup/restore").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + JsonPath.read(p, "$.token") + "\",\"mode\":\"MERGE\"}")).andExpect(status().isOk());
        // the "user_id" of the file was ignored: the line went to the account restoring it
        assertThat(jdbc.queryForObject("select count(*) from body_log where day = '2020-01-01' and user_id = ?", Integer.class, lea.getId()))
                .isEqualTo(1);

        mvc.perform(get("/api/me/backup").with(as(lea))).andExpect(jsonPath("$.driveConfigured").value(false))
                .andExpect(jsonPath("$.drive.connected").value(false));
        mvc.perform(post("/api/me/drive/backup").with(as(lea)).with(csrf())).andExpect(status().isServiceUnavailable());
    }
}
