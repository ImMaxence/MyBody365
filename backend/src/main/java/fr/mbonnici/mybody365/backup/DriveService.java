package fr.mbonnici.mybody365.backup;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.config.AppProperties;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Google Drive backups with the narrowest permission there is (drive.file: the app only ever sees the
 * files it created itself), in a "MyBody365" folder, the 10 latest kept. Every night for the accounts
 * that asked for it, and on demand.
 */
@Service
public class DriveService {

    private static final Logger log = LoggerFactory.getLogger(DriveService.class);
    static final String SCOPE = "https://www.googleapis.com/auth/drive.file";
    private static final String AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String TOKEN = "https://oauth2.googleapis.com/token";
    private static final String REVOKE = "https://oauth2.googleapis.com/revoke";
    private static final String FILES = "https://www.googleapis.com/drive/v3/files";
    private static final String UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
    private static final String FOLDER = "MyBody365";
    private static final int KEEP = 10;

    public record DriveStatus(boolean connected, boolean auto, Instant lastBackupAt, String lastStatus, String lastError) {}

    public record DriveFile(String id, String name, long size, Instant createdTime) {}

    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final AppProperties props;
    private final BackupService backups;
    private final String clientId;
    private final String clientSecret;
    private final SecretBox box;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    public DriveService(JdbcTemplate jdbc, JsonMapper json, AppProperties props, BackupService backups,
            @Value("${spring.security.oauth2.client.registration.google.client-id:}") String clientId,
            @Value("${spring.security.oauth2.client.registration.google.client-secret:}") String clientSecret) {
        this.jdbc = jdbc;
        this.json = json;
        this.props = props;
        this.backups = backups;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.box = new SecretBox(clientSecret == null ? "" : clientSecret, "drive-refresh-token");
    }

    public boolean configured() {
        return clientId != null && !clientId.isBlank() && !clientId.startsWith("not-configured") && clientSecret != null
                && !clientSecret.isBlank() && !clientSecret.startsWith("not-configured");
    }

    private String redirectUri() {
        return props.url() + "/api/me/drive/callback";
    }

    /** Google's consent page, for the Drive permission only */
    public String authorizationUrl(String state, String loginHint) {
        requireConfigured();
        return AUTH + "?client_id=" + enc(clientId) + "&redirect_uri=" + enc(redirectUri()) + "&response_type=code&scope=" + enc(SCOPE)
                + "&access_type=offline&prompt=consent&include_granted_scopes=true&state=" + enc(state)
                + (loginHint == null ? "" : "&login_hint=" + enc(loginHint));
    }

    /** the code Google sent back: a refresh token, kept encrypted */
    public void connect(UUID userId, String code) {
        requireConfigured();
        JsonNode t = post(TOKEN, "code=" + enc(code) + "&client_id=" + enc(clientId) + "&client_secret=" + enc(clientSecret)
                + "&redirect_uri=" + enc(redirectUri()) + "&grant_type=authorization_code");
        String refresh = t.path("refresh_token").asString("");
        if (refresh.isEmpty() || !t.path("scope").asString("").contains(SCOPE)) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "drive_failed");
        }
        jdbc.update("""
                insert into drive_link (user_id, refresh_token_enc) values (?, ?)
                on conflict (user_id) do update set refresh_token_enc = excluded.refresh_token_enc, last_status = null, last_error = null""",
                userId, box.seal(refresh));
    }

    public void disconnect(UUID userId) {
        String refresh = refreshToken(userId);
        jdbc.update("delete from drive_link where user_id = ?", userId);
        if (refresh != null) {
            try {
                post(REVOKE, "token=" + enc(refresh));
            } catch (RuntimeException e) {
                log.info("Drive token revocation failed (removed here anyway)");
            }
        }
    }

    public DriveStatus status(UUID userId) {
        return jdbc.query("select auto_backup, last_backup_at, last_status, last_error from drive_link where user_id = ?", (rs, i) -> {
            Timestamp at = rs.getTimestamp("last_backup_at");
            return new DriveStatus(true, rs.getBoolean("auto_backup"), at == null ? null : at.toInstant(), rs.getString("last_status"),
                    rs.getString("last_error"));
        }, userId).stream().findFirst().orElse(new DriveStatus(false, false, null, null, null));
    }

    public void setAuto(UUID userId, boolean auto) {
        jdbc.update("update drive_link set auto_backup = ? where user_id = ?", auto, userId);
    }

    /** a backup made now and sent to Drive; the older ones beyond the 10 latest go */
    public DriveStatus backupNow(UUID userId, String appVersion) {
        String access = accessToken(userId);
        Path file = null;
        try {
            file = Files.createTempFile("drive-", ".zip");
            try (OutputStream out = Files.newOutputStream(file)) {
                backups.export(userId, appVersion, out);
            }
            String folder = folder(access);
            String name = "mybody365-" + LocalDate.now() + "-" + Instant.now().getEpochSecond() + ".zip";
            upload(access, folder, name, file);
            List<DriveFile> files = list(access, folder);
            for (DriveFile old : files.subList(Math.min(KEEP, files.size()), files.size())) {
                send(HttpRequest.newBuilder(URI.create(FILES + "/" + old.id())).header("Authorization", "Bearer " + access).DELETE().build());
            }
            jdbc.update("update drive_link set last_backup_at = now(), last_status = 'OK', last_error = null where user_id = ?", userId);
        } catch (IOException | RuntimeException e) {
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            jdbc.update("update drive_link set last_status = 'FAILED', last_error = ? where user_id = ?", msg.length() > 290 ? msg.substring(0, 290) : msg,
                    userId);
            if (e instanceof ApiException api) {
                throw api;
            }
            throw new ApiException(HttpStatus.BAD_GATEWAY, "drive_failed");
        } finally {
            delete(file);
        }
        return status(userId);
    }

    public List<DriveFile> backups(UUID userId) {
        String access = accessToken(userId);
        return list(access, folder(access));
    }

    /** a backup from Drive, to a temp file the caller deletes */
    public Path download(UUID userId, String fileId) throws IOException {
        if (!fileId.matches("[A-Za-z0-9_-]{10,200}")) {
            throw ApiException.notFound();
        }
        String access = accessToken(userId);
        Path file = Files.createTempFile("drive-", ".zip");
        HttpRequest req = HttpRequest.newBuilder(URI.create(FILES + "/" + fileId + "?alt=media")).header("Authorization", "Bearer " + access)
                .timeout(Duration.ofMinutes(10)).GET().build();
        try {
            HttpResponse<Path> res = http.send(req, HttpResponse.BodyHandlers.ofFile(file));
            if (res.statusCode() >= 300) {
                throw ApiException.notFound();
            }
            return file;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.BAD_GATEWAY, "drive_failed");
        } catch (IOException | RuntimeException e) {
            delete(file);
            throw e;
        }
    }

    @Scheduled(cron = "0 30 3 * * *", zone = "Europe/Paris")
    public void nightly() {
        if (!configured()) {
            return;
        }
        for (UUID user : jdbc.queryForList("select user_id from drive_link where auto_backup", UUID.class)) {
            try {
                backupNow(user, "nightly");
            } catch (RuntimeException e) {
                log.info("Nightly Drive backup failed for an account: {}", e.getMessage());
            }
        }
    }

    // ── Google APIs ──────────────────────────────────────────────────────────

    private String refreshToken(UUID userId) {
        return jdbc.queryForList("select refresh_token_enc from drive_link where user_id = ?", String.class, userId).stream().findFirst()
                .map(box::open).orElse(null);
    }

    private String accessToken(UUID userId) {
        requireConfigured();
        String refresh = refreshToken(userId);
        if (refresh == null) {
            throw ApiException.badRequest("drive_not_connected");
        }
        JsonNode t = post(TOKEN, "refresh_token=" + enc(refresh) + "&client_id=" + enc(clientId) + "&client_secret=" + enc(clientSecret)
                + "&grant_type=refresh_token");
        String access = t.path("access_token").asString("");
        if (access.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "drive_failed");
        }
        return access;
    }

    private String folder(String access) {
        String q = enc("name = '" + FOLDER + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
        JsonNode found = get(FILES + "?q=" + q + "&spaces=drive&fields=files(id)", access);
        for (JsonNode f : found.path("files")) {
            return f.path("id").asString();
        }
        JsonNode created = send(HttpRequest.newBuilder(URI.create(FILES + "?fields=id")).header("Authorization", "Bearer " + access)
                .header("Content-Type", "application/json; charset=UTF-8")
                .POST(HttpRequest.BodyPublishers.ofString("{\"name\":\"" + FOLDER + "\",\"mimeType\":\"application/vnd.google-apps.folder\"}"))
                .build());
        return created.path("id").asString();
    }

    private List<DriveFile> list(String access, String folder) {
        String q = enc("'" + folder + "' in parents and trashed = false");
        JsonNode res = get(FILES + "?q=" + q + "&orderBy=createdTime%20desc&pageSize=100&fields=files(id,name,size,createdTime)", access);
        List<DriveFile> out = new ArrayList<>();
        for (JsonNode f : res.path("files")) {
            out.add(new DriveFile(f.path("id").asString(), f.path("name").asString(), f.path("size").asLong(0),
                    Instant.parse(f.path("createdTime").asString(Instant.EPOCH.toString()))));
        }
        return out;
    }

    /** resumable upload: first the metadata, then the file in one PUT */
    private void upload(String access, String folder, String name, Path file) throws IOException {
        String meta = json.writeValueAsString(Map.of("name", name, "parents", List.of(folder), "mimeType", "application/zip"));
        HttpRequest start = HttpRequest.newBuilder(URI.create(UPLOAD + "?uploadType=resumable")).header("Authorization", "Bearer " + access)
                .header("Content-Type", "application/json; charset=UTF-8").header("X-Upload-Content-Type", "application/zip")
                .header("X-Upload-Content-Length", Long.toString(Files.size(file))).POST(HttpRequest.BodyPublishers.ofString(meta)).build();
        try {
            HttpResponse<String> res = http.send(start, HttpResponse.BodyHandlers.ofString());
            String location = res.headers().firstValue("Location").orElse(null);
            if (res.statusCode() >= 300 || location == null || !location.startsWith("https://www.googleapis.com/")) {
                throw new IOException("Drive upload refused (" + res.statusCode() + ")");
            }
            HttpResponse<String> put = http.send(HttpRequest.newBuilder(URI.create(location)).timeout(Duration.ofMinutes(15))
                    .header("Content-Type", "application/zip").PUT(HttpRequest.BodyPublishers.ofFile(file)).build(),
                    HttpResponse.BodyHandlers.ofString());
            if (put.statusCode() >= 300) {
                throw new IOException("Drive upload failed (" + put.statusCode() + ")");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted", e);
        }
    }

    private JsonNode get(String url, String access) {
        return send(HttpRequest.newBuilder(URI.create(url)).header("Authorization", "Bearer " + access).GET().build());
    }

    private JsonNode post(String url, String form) {
        return send(HttpRequest.newBuilder(URI.create(url)).header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form)).build());
    }

    private JsonNode send(HttpRequest req) {
        try {
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 300) {
                log.info("Google answered {} on {}", res.statusCode(), req.uri().getHost() + req.uri().getPath());
                if (res.statusCode() == 400 || res.statusCode() == 401) {
                    throw ApiException.badRequest("drive_not_connected");
                }
                throw new ApiException(HttpStatus.BAD_GATEWAY, "drive_failed");
            }
            return res.body().isBlank() ? json.readTree("{}") : json.readTree(res.body());
        } catch (IOException e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "drive_failed");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.BAD_GATEWAY, "drive_failed");
        }
    }

    private void requireConfigured() {
        if (!configured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "drive_not_configured");
        }
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    private static void delete(Path file) {
        if (file != null) {
            try {
                Files.deleteIfExists(file);
            } catch (IOException ignored) {
                // temp file
            }
        }
    }
}
