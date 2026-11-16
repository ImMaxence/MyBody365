package fr.mbonnici.mybody365.backup;

import fr.mbonnici.mybody365.backup.BackupService.Mode;
import fr.mbonnici.mybody365.backup.BackupService.Preview;
import fr.mbonnici.mybody365.backup.BackupService.Result;
import fr.mbonnici.mybody365.backup.DriveService.DriveFile;
import fr.mbonnici.mybody365.backup.DriveService.DriveStatus;
import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.config.AppProperties;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/** Export, restore (preview first), and Google Drive. */
@RestController
public class BackupController {

    private static final String STATE = "mb.drive.state";
    private static final SecureRandom RANDOM = new SecureRandom();

    public record Overview(boolean driveConfigured, DriveStatus drive) {}

    public record RestoreInput(@NotBlank String token, @NotNull Mode mode) {}

    private final BackupService backups;
    private final DriveService drive;
    private final UserService users;
    private final AppProperties props;
    private final String version;

    public BackupController(BackupService backups, DriveService drive, UserService users, AppProperties props,
            ObjectProvider<BuildProperties> build) {
        this.backups = backups;
        this.drive = drive;
        this.users = users;
        this.props = props;
        BuildProperties b = build.getIfAvailable();
        this.version = b == null ? "dev" : b.getVersion();
    }

    @GetMapping("/api/me/backup")
    public Overview overview(Authentication auth) {
        UUID me = users.current(auth).getId();
        return new Overview(drive.configured(), drive.status(me));
    }

    @GetMapping("/api/me/backup/export")
    public ResponseEntity<StreamingResponseBody> export(Authentication auth) {
        UUID me = users.current(auth).getId();
        String name = "mybody365-" + LocalDate.now() + ".zip";
        StreamingResponseBody body = out -> backups.export(me, version, out);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/zip"))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(name).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(body);
    }

    @PostMapping(value = "/api/me/backup/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Preview preview(@RequestParam("file") MultipartFile file, Authentication auth) throws IOException {
        UUID me = users.current(auth).getId();
        Path tmp = Files.createTempFile("upload-", ".zip");
        try {
            file.transferTo(tmp);
            return backups.preview(me, tmp);
        } finally {
            Files.deleteIfExists(tmp);
        }
    }

    @PostMapping("/api/me/backup/restore")
    public Result restore(@Valid @RequestBody RestoreInput body, Authentication auth) {
        return backups.restore(users.current(auth).getId(), body.token(), body.mode());
    }

    // ── Google Drive ─────────────────────────────────────────────────────────

    /** off to Google's consent page; the state ties the answer to this session */
    @GetMapping("/api/me/drive/connect")
    public void connect(Authentication auth, HttpSession session, HttpServletResponse response) throws IOException {
        AppUser me = users.current(auth);
        byte[] raw = new byte[24];
        RANDOM.nextBytes(raw);
        String state = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        session.setAttribute(STATE, state);
        response.sendRedirect(drive.authorizationUrl(state, me.getGoogleEmail()));
    }

    @GetMapping("/api/me/drive/callback")
    public void callback(@RequestParam(required = false) String code, @RequestParam(required = false) String state,
            @RequestParam(required = false) String error, Authentication auth, HttpSession session, HttpServletResponse response)
            throws IOException {
        Object expected = session.getAttribute(STATE);
        session.removeAttribute(STATE);
        String back = props.url() + "/app/account/backup";
        if (error != null || code == null || state == null || !state.equals(expected)) {
            response.sendRedirect(back + "?drive=cancelled");
            return;
        }
        try {
            drive.connect(users.current(auth).getId(), code);
            response.sendRedirect(back + "?drive=connected");
        } catch (ApiException e) {
            response.sendRedirect(back + "?drive=failed");
        }
    }

    @DeleteMapping("/api/me/drive")
    public Overview disconnect(Authentication auth) {
        drive.disconnect(users.current(auth).getId());
        return overview(auth);
    }

    @PutMapping("/api/me/drive")
    public Overview settings(@RequestBody Map<String, Boolean> body, Authentication auth) {
        drive.setAuto(users.current(auth).getId(), Boolean.TRUE.equals(body.get("auto")));
        return overview(auth);
    }

    @PostMapping("/api/me/drive/backup")
    public Overview backupNow(Authentication auth) {
        drive.backupNow(users.current(auth).getId(), version);
        return overview(auth);
    }

    @GetMapping("/api/me/drive/backups")
    public List<DriveFile> driveBackups(Authentication auth) {
        return drive.backups(users.current(auth).getId());
    }

    @PostMapping("/api/me/drive/backups/{fileId}/preview")
    public Preview drivePreview(@PathVariable String fileId, Authentication auth) throws IOException {
        UUID me = users.current(auth).getId();
        Path tmp = drive.download(me, fileId);
        try {
            return backups.preview(me, tmp);
        } finally {
            Files.deleteIfExists(tmp);
        }
    }
}
