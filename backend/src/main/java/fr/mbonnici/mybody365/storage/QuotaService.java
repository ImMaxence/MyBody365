package fr.mbonnici.mybody365.storage;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.config.AppProperties;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Storage used by an account (every picture it owns) against its quota. */
@Service
public class QuotaService {

    public record Usage(long usedBytes, long quotaBytes) {}

    private static final long MB = 1024L * 1024L;

    private final JdbcTemplate jdbc;
    private final AppProperties props;

    public QuotaService(JdbcTemplate jdbc, AppProperties props) {
        this.jdbc = jdbc;
        this.props = props;
    }

    public long usedBytes(UUID userId) {
        Long used = jdbc.queryForObject("""
                select coalesce((select sum(bytes + thumb_bytes) from photo where user_id = ?), 0)
                     + coalesce((select sum(image_bytes) from recipe where owner_id = ? and image_bytes is not null), 0)
                     + coalesce((select avatar_bytes from app_user where id = ?), 0)""",
                Long.class, userId, userId, userId);
        return used == null ? 0 : used;
    }

    public long quotaBytes(UUID userId) {
        Integer mb = jdbc.queryForObject("select storage_quota_mb from app_user where id = ?", Integer.class, userId);
        return (mb == null ? props.storage().quotaMb() : mb) * MB;
    }

    public Usage usage(UUID userId) {
        return new Usage(usedBytes(userId), quotaBytes(userId));
    }

    /** refuses a new file when it would not fit; {@code freed} is what the upload replaces */
    public void check(UUID userId, long incoming, long freed) {
        if (usedBytes(userId) - freed + incoming > quotaBytes(userId)) {
            throw ApiException.conflict("quota_exceeded");
        }
    }
}
