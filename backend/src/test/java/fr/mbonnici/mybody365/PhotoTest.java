package fr.mbonnici.mybody365;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import fr.mbonnici.mybody365.photo.Photo;
import fr.mbonnici.mybody365.photo.PhotoRepository;
import fr.mbonnici.mybody365.storage.ObjectStorage;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.AppUser;
import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;

/** Body photos: re-encoded without metadata, private to their owner, counted against the quota. */
class PhotoTest extends AbstractIntegrationTest {

    @Autowired
    PhotoRepository photoRepository;

    @Autowired
    ObjectStorage storage;

    private AppUser lea;
    private AppUser hugo;
    private AppUser admin;

    @BeforeEach
    void setUp() {
        wipe();
        lea = account("lea@example.com", AppUser.Role.USER);
        hugo = account("hugo@example.com", AppUser.Role.USER);
        admin = account("admin@example.com", AppUser.Role.ADMIN);
    }

    /** a 1200×900 JPEG carrying a comment with a GPS position, as some phones write one */
    static byte[] jpegWithSecret() throws Exception {
        BufferedImage img = new BufferedImage(1200, 900, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setPaint(new GradientPaint(0, 0, new Color(255, 120, 40), 1200, 900, new Color(40, 60, 220)));
        g.fillRect(0, 0, 1200, 900);
        g.dispose();
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        ImageIO.write(img, "jpeg", bos);
        byte[] plain = bos.toByteArray();
        byte[] comment = "GPS 48.8566,2.3522".getBytes(StandardCharsets.US_ASCII);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(plain, 0, 2); // SOI
        out.write(0xff);
        out.write(0xfe); // COM segment
        out.write((comment.length + 2) >> 8);
        out.write((comment.length + 2) & 0xff);
        out.write(comment);
        out.write(plain, 2, plain.length - 2);
        return out.toByteArray();
    }

    private MvcResult upload(AppUser who, byte[] bytes, String day, String pose) throws Exception {
        var req = multipart("/api/me/photos").file(new MockMultipartFile("file", "photo.jpg", "image/jpeg", bytes))
                .param("pose", pose).with(as(who)).with(csrf());
        if (day != null) {
            req.param("day", day);
        }
        return mvc.perform(req).andReturn();
    }

    @Test
    void anUploadIsResizedStrippedAndPrivate() throws Exception {
        MvcResult res = upload(lea, jpegWithSecret(), null, "FRONT");
        assertThat(res.getResponse().getStatus()).isEqualTo(201);
        String body = res.getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");
        assertThat((Integer) JsonPath.read(body, "$.width")).isEqualTo(1200);
        assertThat((String) JsonPath.read(body, "$.day")).isEqualTo(TrackingService.today().toString());

        mvc.perform(get("/api/me/photos").with(as(lea))).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].url").value("/api/photos/" + id + "/full"));

        MvcResult img = mvc.perform(get("/api/photos/" + id + "/full").with(as(lea))).andExpect(status().isOk()).andReturn();
        byte[] stored = img.getResponse().getContentAsByteArray();
        assertThat(img.getResponse().getContentType()).isIn("image/webp", "image/jpeg");
        assertThat(img.getResponse().getHeader("Cache-Control")).contains("private");
        // drawn again from the pixels: nothing of the original file is left
        assertThat(new String(stored, StandardCharsets.ISO_8859_1)).doesNotContain("48.8566");
        byte[] thumb = mvc.perform(get("/api/photos/" + id + "/thumb").with(as(lea))).andExpect(status().isOk()).andReturn()
                .getResponse().getContentAsByteArray();
        assertThat(thumb.length).isLessThan(stored.length);

        // nobody else, admins included
        mvc.perform(get("/api/photos/" + id + "/full").with(as(hugo))).andExpect(status().isNotFound());
        mvc.perform(get("/api/photos/" + id + "/thumb").with(as(admin))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/me/photos/" + id).with(as(hugo)).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(get("/api/photos/" + id + "/full")).andExpect(status().isUnauthorized());
    }

    @Test
    void aNewPhotoOfTheSameDayAndPoseReplacesTheOldOne() throws Exception {
        String day = TrackingService.today().minusDays(3).toString();
        String first = JsonPath.read(upload(lea, jpegWithSecret(), day, "SIDE").getResponse().getContentAsString(), "$.id");
        Photo old = photoRepository.findById(UUID.fromString(first)).orElseThrow();
        String second = JsonPath.read(upload(lea, jpegWithSecret(), day, "SIDE").getResponse().getContentAsString(), "$.id");
        assertThat(second).isNotEqualTo(first);
        mvc.perform(get("/api/me/photos").with(as(lea))).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/photos/" + first + "/full").with(as(lea))).andExpect(status().isNotFound());
        assertThat(storage.get(old.key())).isNull();
        // another pose is another photo
        upload(lea, jpegWithSecret(), day, "BACK");
        mvc.perform(get("/api/me/photos").with(as(lea))).andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void onlyPicturesAreAccepted() throws Exception {
        MvcResult res = upload(lea, "%PDF-1.7 not a picture at all".getBytes(StandardCharsets.US_ASCII), null, "FRONT");
        assertThat(res.getResponse().getStatus()).isEqualTo(400);
        assertThat(res.getResponse().getContentAsString()).contains("unsupported_image");
        res = upload(lea, jpegWithSecret(), TrackingService.today().plusDays(5).toString(), "FRONT");
        assertThat(res.getResponse().getContentAsString()).contains("invalid_day");
    }

    @Test
    void theQuotaIsEnforced() throws Exception {
        jdbc.update("update app_user set storage_quota_mb = 0 where id = ?", lea.getId());
        MvcResult res = upload(lea, jpegWithSecret(), null, "FRONT");
        assertThat(res.getResponse().getStatus()).isEqualTo(409);
        assertThat(res.getResponse().getContentAsString()).contains("quota_exceeded");
        jdbc.update("update app_user set storage_quota_mb = null where id = ?", lea.getId());
        assertThat(upload(lea, jpegWithSecret(), null, "FRONT").getResponse().getStatus()).isEqualTo(201);
        mvc.perform(get("/api/me/storage").with(as(lea)))
                .andExpect(jsonPath("$.usedBytes").isNumber())
                .andExpect(jsonPath("$.quotaBytes").value(2048L * 1024 * 1024));
    }

    @Test
    void deletingAPhotoOrTheAccountDeletesTheFiles() throws Exception {
        String id = JsonPath.read(upload(lea, jpegWithSecret(), null, "FRONT").getResponse().getContentAsString(), "$.id");
        Photo p = photoRepository.findById(UUID.fromString(id)).orElseThrow();
        mvc.perform(delete("/api/me/photos/" + id).with(as(lea)).with(csrf())).andExpect(status().isNoContent());
        assertThat(storage.get(p.key())).isNull();

        String other = JsonPath.read(upload(lea, jpegWithSecret(), null, "SIDE").getResponse().getContentAsString(), "$.id");
        Photo q = photoRepository.findById(UUID.fromString(other)).orElseThrow();
        assertThat(storage.get(q.key())).isNotNull();
        users.delete(userRepository.findById(lea.getId()).orElseThrow());
        assertThat(storage.get(q.key())).isNull();
        assertThat(storage.get(q.thumbKey())).isNull();
    }
}
