package fr.mbonnici.mybody365.support;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The errors the app runs into, on the phones (sent by the app) and on the server (unexpected
 * exceptions), for the admins. The same error again only counts on its open line; once archived, a new
 * occurrence opens a new line. Never in the way: recording an error cannot fail a request.
 */
@Service
public class ErrorLogService {

    private static final Logger log = LoggerFactory.getLogger(ErrorLogService.class);
    /** a flood of different errors stops being recorded here (the server logs keep them) */
    static final int MAX_OPEN = 500;

    public enum Source { APP, SERVER }

    public record ErrorDto(UUID id, Source source, String message, String detail, String path, String appVersion, String device,
            String userName, int occurrences, Instant firstSeen, Instant lastSeen, Instant archivedAt) {}

    private final JdbcTemplate jdbc;

    public ErrorLogService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void record(Source source, String message, String detail, String path, String appVersion, String device, UUID userId) {
        try {
            String msg = cut(message == null || message.isBlank() ? "(no message)" : message.strip(), 500);
            String det = cut(detail, 8000);
            String fp = fingerprint(source, msg, det, path);
            Integer open = jdbc.queryForObject("select count(*) from error_log where archived_at is null", Integer.class);
            boolean known = !jdbc.queryForList("select 1 from error_log where fingerprint = ? and archived_at is null", Integer.class, fp)
                    .isEmpty();
            if (!known && open != null && open >= MAX_OPEN) {
                return;
            }
            jdbc.update("""
                    insert into error_log (id, fingerprint, source, message, detail, path, app_version, device, user_id)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    on conflict (fingerprint) where archived_at is null do update set
                      occurrences = error_log.occurrences + 1, last_seen = now(), detail = excluded.detail, path = excluded.path,
                      app_version = excluded.app_version, device = excluded.device, user_id = excluded.user_id""",
                    UUID.randomUUID(), fp, source.name(), msg, det, cut(path, 300), cut(appVersion, 20), cut(device, 300), userId);
        } catch (RuntimeException e) {
            log.warn("Could not record an error: {}", e.getMessage());
        }
    }

    public List<ErrorDto> list(boolean archived, int limit) {
        return jdbc.query("""
                select e.*, u.display_name from error_log e left join app_user u on u.id = e.user_id
                where (e.archived_at is not null) = ? order by e.last_seen desc limit ?""",
                (rs, i) -> new ErrorDto(rs.getObject("id", UUID.class), Source.valueOf(rs.getString("source")), rs.getString("message"),
                        rs.getString("detail"), rs.getString("path"), rs.getString("app_version"), rs.getString("device"),
                        rs.getString("display_name"), rs.getInt("occurrences"), instant(rs.getTimestamp("first_seen")),
                        instant(rs.getTimestamp("last_seen")), instant(rs.getTimestamp("archived_at"))),
                archived, limit);
    }

    public int open() {
        Integer n = jdbc.queryForObject("select count(*) from error_log where archived_at is null", Integer.class);
        return n == null ? 0 : n;
    }

    public boolean archive(UUID id) {
        return jdbc.update("update error_log set archived_at = now() where id = ? and archived_at is null", id) == 1;
    }

    public int archiveAll() {
        return jdbc.update("update error_log set archived_at = now() where archived_at is null");
    }

    /**
     * Same source, same message and same first lines of the trace, numbers aside: "item 12" and "item 13"
     * are the same error; the page it happened on does not matter.
     */
    static String fingerprint(Source source, String message, String detail, String path) {
        String head = detail == null ? "" : String.join("\n", detail.lines().limit(3).toList());
        String key = source + "|" + normalize(message) + "|" + normalize(head);
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(h);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String normalize(String s) {
        return s == null ? "" : s.replaceAll("[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}", "#").replaceAll("\\d+", "#");
    }

    private static String cut(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
