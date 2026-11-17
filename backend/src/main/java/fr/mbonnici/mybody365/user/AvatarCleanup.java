package fr.mbonnici.mybody365.user;

import fr.mbonnici.mybody365.storage.ObjectStorage;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The Google pictures copied into the app before 1.6 are no longer shown (migration V16 put the initial back):
 * their files leave the bucket here, a few at a time, once the app has started.
 */
@Component
public class AvatarCleanup {

    private static final Logger log = LoggerFactory.getLogger(AvatarCleanup.class);

    private final JdbcTemplate jdbc;
    private final ObjectStorage storage;

    public AvatarCleanup(JdbcTemplate jdbc, ObjectStorage storage) {
        this.jdbc = jdbc;
        this.storage = storage;
    }

    @Scheduled(initialDelayString = "PT30S", fixedDelayString = "PT10M")
    public void run() {
        try {
            clean(50);
        } catch (RuntimeException e) {
            log.warn("Avatar cleanup: {}", e.getMessage());
        }
    }

    /** public for the tests; how many files were deleted */
    public int clean(int max) {
        List<Map<String, Object>> rows = jdbc.queryForList("select user_id, version from avatar_cleanup limit ?", max);
        int done = 0;
        for (Map<String, Object> r : rows) {
            UUID id = (UUID) r.get("user_id");
            try {
                storage.delete(AvatarService.key(id, (Integer) r.get("version")));
                done++;
            } catch (RuntimeException e) {
                // gone already, or the bucket is away: the row goes anyway, a forgotten file only costs space
                log.info("Could not delete the old picture of {}: {}", id, e.getMessage());
            }
            jdbc.update("delete from avatar_cleanup where user_id = ?", id);
        }
        return done;
    }
}
