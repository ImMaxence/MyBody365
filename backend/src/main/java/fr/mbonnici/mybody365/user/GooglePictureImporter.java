package fr.mbonnici.mybody365.user;

import fr.mbonnici.mybody365.common.ApiException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The Google picture of an account becomes a picture of its own, stored and served by the app like an
 * uploaded one: phones no longer load it from Google (an iPhone could show a broken image instead), and
 * friends' phones never call Google either. It is fetched once, after the first Google sign-in (and once
 * for the accounts that existed before). Removing it afterwards leaves the initial, for good.
 * <p>
 * Only https://*.googleusercontent.com is ever fetched, without following redirects, 5 MB at most.
 */
@Component
public class GooglePictureImporter {

    private static final Logger log = LoggerFactory.getLogger(GooglePictureImporter.class);
    private static final long MAX_BYTES = 5L * 1024 * 1024;
    /** a temporary failure (network, 5xx, 429) waits this long before the next try */
    private static final Duration RETRY = Duration.ofHours(1);

    private final JdbcTemplate jdbc;
    private final AppUserRepository users;
    private final AvatarService avatars;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    private final Map<UUID, Instant> failed = new ConcurrentHashMap<>();

    public GooglePictureImporter(JdbcTemplate jdbc, AppUserRepository users, AvatarService avatars) {
        this.jdbc = jdbc;
        this.users = users;
        this.avatars = avatars;
    }

    @Scheduled(initialDelayString = "PT20S", fixedDelayString = "PT1M")
    public void run() {
        try {
            importPending(20);
        } catch (RuntimeException e) {
            log.warn("Google pictures: {}", e.getMessage());
        }
    }

    /** the accounts still showing a Google address (public for the tests); how many were imported */
    public int importPending(int max) {
        Instant now = Instant.now();
        failed.values().removeIf(at -> at.plus(RETRY).isBefore(now));
        List<UUID> ids = jdbc.queryForList("select id from app_user where avatar_version is null and avatar_url is not null limit ?",
                UUID.class, max + failed.size());
        int done = 0;
        for (UUID id : ids) {
            if (done >= max) {
                break;
            }
            if (!failed.containsKey(id) && importOne(id)) {
                done++;
            }
        }
        return done;
    }

    private boolean importOne(UUID id) {
        AppUser user = users.findById(id).orElse(null);
        if (user == null || user.getAvatarVersion() != null || user.getAvatarUrl() == null) {
            return false;
        }
        URI uri;
        try {
            uri = URI.create(user.getAvatarUrl());
        } catch (IllegalArgumentException e) {
            forget(user);
            return false;
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (!"https".equals(uri.getScheme()) || !host.endsWith(".googleusercontent.com")) {
            forget(user);
            return false;
        }
        try {
            HttpResponse<InputStream> res = http.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10)).GET().build(),
                    HttpResponse.BodyHandlers.ofInputStream());
            int status = res.statusCode();
            if (status == 200) {
                byte[] bytes;
                try (InputStream in = res.body()) {
                    bytes = in.readNBytes((int) MAX_BYTES + 1);
                }
                if (bytes.length > MAX_BYTES) {
                    forget(user);
                    return false;
                }
                AppUser saved = avatars.set(user, bytes);
                saved.setAvatarUrl(null);
                users.save(saved);
                return true;
            }
            res.body().close();
            if (status == 429 || status >= 500) {
                failed.put(id, Instant.now());
            } else {
                // gone or refused for good: the initial is shown
                forget(user);
            }
        } catch (ApiException e) {
            // not an image, or no room left in the account's storage
            forget(user);
        } catch (IOException e) {
            failed.put(id, Instant.now());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return false;
    }

    private void forget(AppUser user) {
        log.info("Google picture of {} not imported", user.getId());
        user.setAvatarUrl(null);
        users.save(user);
    }
}
