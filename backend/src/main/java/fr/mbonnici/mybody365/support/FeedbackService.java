package fr.mbonnici.mybody365.support;

import fr.mbonnici.mybody365.push.PushService;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.AppUserRepository;
import fr.mbonnici.mybody365.user.UserService;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** What members tell the creator from the app (an idea, a bug, anything): kept for the admins, who get a notification. */
@Service
public class FeedbackService {

    private static final Logger log = LoggerFactory.getLogger(FeedbackService.class);

    public enum Kind { IDEA, BUG, OTHER }

    public record FeedbackDto(UUID id, Kind kind, String message, String userName, String userEmail, String appVersion, String device,
            Instant createdAt, Instant archivedAt) {}

    private final JdbcTemplate jdbc;
    private final AppUserRepository users;
    private final UserService userService;
    private final PushService push;

    public FeedbackService(JdbcTemplate jdbc, AppUserRepository users, UserService userService, PushService push) {
        this.jdbc = jdbc;
        this.users = users;
        this.userService = userService;
        this.push = push;
    }

    public void send(AppUser from, Kind kind, String message, String appVersion, String device) {
        jdbc.update("insert into feedback (id, user_id, kind, message, app_version, device) values (?, ?, ?, ?, ?, ?)", UUID.randomUUID(),
                from.getId(), kind.name(), message.strip(), cut(appVersion, 20), cut(device, 300));
        String name = from.getDisplayName();
        String preview = message.strip().replaceAll("\\s+", " ");
        Map<String, String> args = Map.of("name", name, "kind", kind.name(), "text", preview.length() > 110 ? preview.substring(0, 110) + "…" : preview);
        for (AppUser admin : users.findAll()) {
            if (admin.getStatus() == AppUser.Status.ACTIVE && userService.isAdmin(admin) && !admin.getId().equals(from.getId())) {
                try {
                    push.notify(admin.getId(), PushService.Kind.FEEDBACK, args);
                } catch (RuntimeException e) {
                    log.info("Feedback notification failed: {}", e.getMessage());
                }
            }
        }
    }

    public List<FeedbackDto> list(boolean archived, int limit) {
        return jdbc.query("""
                select f.*, u.display_name, u.email from feedback f left join app_user u on u.id = f.user_id
                where (f.archived_at is not null) = ? order by f.created_at desc limit ?""",
                (rs, i) -> new FeedbackDto(rs.getObject("id", UUID.class), Kind.valueOf(rs.getString("kind")), rs.getString("message"),
                        rs.getString("display_name"), rs.getString("email"), rs.getString("app_version"), rs.getString("device"),
                        instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("archived_at"))),
                archived, limit);
    }

    public int open() {
        Integer n = jdbc.queryForObject("select count(*) from feedback where archived_at is null", Integer.class);
        return n == null ? 0 : n;
    }

    public boolean archive(UUID id) {
        return jdbc.update("update feedback set archived_at = now() where id = ? and archived_at is null", id) == 1;
    }

    private static String cut(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
