package fr.mbonnici.mybody365.push;

import fr.mbonnici.mybody365.push.PushService.Kind;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * A word to everyone when a new version of the app is deployed. A few minutes after the start (the new
 * site goes online at the same time), the version of this build (pom.xml, kept equal to CHANGELOG.md) is
 * compared with the last one announced: a newer one is announced once, to every device whose owner kept
 * "what's new" on. The very first start only records the version. Several instances never send it twice.
 */
@Component
public class ReleaseNotifier {

    private static final Logger log = LoggerFactory.getLogger(ReleaseNotifier.class);
    static final String KEY = "announced_version";

    private final JdbcTemplate jdbc;
    private final PushService push;
    private final ObjectProvider<BuildProperties> build;

    public ReleaseNotifier(JdbcTemplate jdbc, PushService push, ObjectProvider<BuildProperties> build) {
        this.jdbc = jdbc;
        this.push = push;
        this.build = build;
    }

    @Scheduled(initialDelayString = "${app.release-notice-delay:PT3M}", fixedDelayString = "PT1H")
    public void check() {
        BuildProperties b = build.getIfAvailable();
        if (b == null) {
            return;
        }
        try {
            announce(b.getVersion());
        } catch (RuntimeException e) {
            log.warn("Release notice failed: {}", e.getMessage());
        }
    }

    /** how many accounts were told about {@code version} (public for the tests) */
    public int announce(String version) {
        if (version == null || !version.matches("\\d+\\.\\d+\\.\\d+")) {
            return 0;
        }
        String last = jdbc.queryForList("select value from app_state where name = ?", String.class, KEY).stream().findFirst().orElse(null);
        if (last == null) {
            jdbc.update("insert into app_state (name, value) values (?, ?) on conflict (name) do nothing", KEY, version);
            return 0;
        }
        if (compare(version, last) <= 0) {
            return 0;
        }
        // claimed first: only the instance that moves the value sends
        if (jdbc.update("update app_state set value = ?, updated_at = now() where name = ? and value = ?", version, KEY, last) != 1) {
            return 0;
        }
        List<UUID> accounts = jdbc.queryForList("""
                select distinct s.user_id from push_subscription s
                join app_user u on u.id = s.user_id and u.status = 'ACTIVE'
                left join notification_pref p on p.user_id = s.user_id
                where coalesce(p.updates_enabled, true)""", UUID.class);
        int told = 0;
        for (UUID account : accounts) {
            if (push.notify(account, Kind.UPDATE, Map.of("version", version)) > 0) {
                told++;
            }
        }
        log.info("Version {} announced to {} account(s)", version, told);
        return told;
    }

    /** "1.10.0" after "1.9.2" */
    static int compare(String a, String b) {
        String[] x = a.split("\\.");
        String[] y = b.split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int d = Integer.compare(i < x.length ? parse(x[i]) : 0, i < y.length ? parse(y[i]) : 0);
            if (d != 0) {
                return d;
            }
        }
        return 0;
    }

    private static int parse(String s) {
        try {
            return Integer.parseInt(s.replaceAll("\\D.*$", ""));
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
