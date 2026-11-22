package fr.mbonnici.mybody365.push;

import fr.mbonnici.mybody365.push.PushService.Kind;
import fr.mbonnici.mybody365.push.PushService.Subscription;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Devices that receive notifications, and when to send the reminders. */
@RestController
public class NotificationController {

    public record Keys(@NotBlank @Size(max = 200) String p256dh, @NotBlank @Size(max = 100) String auth) {}

    public record SubscriptionInput(@NotBlank @Size(max = 1000) String endpoint, @NotNull @Valid Keys keys) {}

    public record Prefs(
            boolean dailyEnabled,
            @NotNull @Pattern(regexp = "([01]\\d|2[0-3]):[0-5]\\d") String dailyTime,
            boolean gymEnabled,
            @NotNull @Pattern(regexp = "^([1-7](,[1-7]){0,6})?$") String gymDays,
            @NotNull @Pattern(regexp = "([01]\\d|2[0-3]):[0-5]\\d") String gymTime,
            boolean friendsEnabled,
            /** a glass of water when the day is behind; null (an app older than 1.1): unchanged */
            Boolean waterEnabled,
            /** a word when a new version comes out; null (an app older than 1.1): unchanged */
            Boolean updatesEnabled,
            /** the summary of the week on Sunday evening; null (an app older than 1.7): unchanged */
            Boolean weeklyEnabled,
            /** 1.11: the photo of the day, at its own time, if not taken yet; null (an older app): unchanged */
            Boolean photoEnabled,
            @Pattern(regexp = "([01]\\d|2[0-3]):[0-5]\\d") String photoTime,
            /** 1.17: the daily reminder of the challenges whose day is not done, at its own time; null (an older app): unchanged */
            Boolean challengeEnabled,
            @Pattern(regexp = TIME) String challengeTime) {}

    /** 1.17: a time of day, hh:mm */
    static final String TIME = "([01]\\d|2[0-3]):[0-5]\\d";

    public record Settings(String publicKey, int devices, Prefs prefs) {}

    /** 1.17: a notification the app sent, as the phone showed it; unread when it came after the centre was last opened */
    public record Sent(UUID id, String kind, String title, String body, String url, Instant createdAt, boolean unread) {}

    /** 1.17: a page of the notification centre, latest first */
    public record History(List<Sent> items, int page, int pages, long total) {}

    /** 1.17: the notifications of a page of the centre */
    static final int PAGE_SIZE = 20;

    private final PushService push;
    private final UserService users;
    private final JdbcTemplate jdbc;

    public NotificationController(PushService push, UserService users, JdbcTemplate jdbc) {
        this.push = push;
        this.users = users;
        this.jdbc = jdbc;
    }

    @GetMapping("/api/me/notifications")
    public Settings settings(Authentication auth) {
        UUID me = users.current(auth).getId();
        return new Settings(push.publicKey(), push.devices(me), prefs(me));
    }

    @PutMapping("/api/me/notifications")
    public Settings save(@Valid @RequestBody Prefs p, Authentication auth) {
        UUID me = users.current(auth).getId();
        LocalTime photoTime = p.photoTime() == null ? null : LocalTime.parse(p.photoTime());
        LocalTime challengeTime = p.challengeTime() == null ? null : LocalTime.parse(p.challengeTime());
        jdbc.update("""
                insert into notification_pref (user_id, daily_enabled, daily_time, gym_enabled, gym_days, gym_time, friends_enabled,
                  water_enabled, updates_enabled, weekly_enabled, photo_enabled, photo_time, challenge_enabled, challenge_time)
                values (?, ?, ?, ?, ?, ?, ?, coalesce(?, false), coalesce(?, true), coalesce(?, true), coalesce(?, true),
                  coalesce(?, time '19:00'), coalesce(?, true), coalesce(?, time '20:00'))
                on conflict (user_id) do update set daily_enabled = excluded.daily_enabled, daily_time = excluded.daily_time,
                  gym_enabled = excluded.gym_enabled, gym_days = excluded.gym_days, gym_time = excluded.gym_time,
                  friends_enabled = excluded.friends_enabled,
                  water_enabled = coalesce(?, notification_pref.water_enabled),
                  updates_enabled = coalesce(?, notification_pref.updates_enabled),
                  weekly_enabled = coalesce(?, notification_pref.weekly_enabled),
                  photo_enabled = coalesce(?, notification_pref.photo_enabled),
                  photo_time = coalesce(?, notification_pref.photo_time),
                  challenge_enabled = coalesce(?, notification_pref.challenge_enabled),
                  challenge_time = coalesce(?, notification_pref.challenge_time)""",
                me, p.dailyEnabled(), LocalTime.parse(p.dailyTime()), p.gymEnabled(), p.gymDays(), LocalTime.parse(p.gymTime()),
                p.friendsEnabled(), p.waterEnabled(), p.updatesEnabled(), p.weeklyEnabled(), p.photoEnabled(), photoTime, p.challengeEnabled(),
                challengeTime, p.waterEnabled(), p.updatesEnabled(), p.weeklyEnabled(), p.photoEnabled(), photoTime, p.challengeEnabled(), challengeTime);
        return settings(auth);
    }

    /** 1.17: the notification centre, latest first, by pages of 20 (kept 90 days) */
    @GetMapping("/api/me/notifications/history")
    public History history(@RequestParam(defaultValue = "0") int page, Authentication auth) {
        UUID me = users.current(auth).getId();
        Long total = jdbc.queryForObject("select count(*) from notification_log where user_id = ?", Long.class, me);
        long count = total == null ? 0 : total;
        int pages = (int) Math.max(1, (count + PAGE_SIZE - 1) / PAGE_SIZE);
        int at = Math.clamp(page, 0, pages - 1);
        Timestamp seen = jdbc.queryForObject("select notifications_seen_at from app_user where id = ?", Timestamp.class, me);
        List<Sent> items = jdbc.query("""
                select id, kind, title, body, url, created_at from notification_log where user_id = ?
                order by created_at desc, id limit ? offset ?""", (rs, i) -> {
            Instant created = rs.getTimestamp("created_at").toInstant();
            return new Sent(rs.getObject("id", UUID.class), rs.getString("kind"), rs.getString("title"), rs.getString("body"), rs.getString("url"),
                    created, seen == null || created.isAfter(seen.toInstant()));
        }, me, PAGE_SIZE, at * PAGE_SIZE);
        return new History(items, at, pages, count);
    }

    /** 1.17: the centre opened: what came until now is read */
    @PostMapping("/api/me/notifications/seen")
    public ResponseEntity<Void> seen(Authentication auth) {
        jdbc.update("update app_user set notifications_seen_at = now() where id = ?", users.current(auth).getId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/me/push/subscriptions")
    public Settings subscribe(@Valid @RequestBody SubscriptionInput body, Authentication auth) {
        push.subscribe(users.current(auth).getId(), new Subscription(body.endpoint(), body.keys().p256dh(), body.keys().auth()));
        return settings(auth);
    }

    @DeleteMapping("/api/me/push/subscriptions")
    public Settings unsubscribe(@RequestBody Map<String, String> body, Authentication auth) {
        push.unsubscribe(users.current(auth).getId(), body.getOrDefault("endpoint", ""));
        return settings(auth);
    }

    @PostMapping("/api/me/push/test")
    public Map<String, Integer> test(Authentication auth) {
        return Map.of("sent", push.notify(users.current(auth).getId(), Kind.TEST, Map.of()));
    }

    private Prefs prefs(UUID userId) {
        return jdbc.query("select * from notification_pref where user_id = ?", (rs, i) -> new Prefs(rs.getBoolean("daily_enabled"),
                rs.getTime("daily_time").toLocalTime().toString(), rs.getBoolean("gym_enabled"), rs.getString("gym_days"),
                rs.getTime("gym_time").toLocalTime().toString(), rs.getBoolean("friends_enabled"), rs.getBoolean("water_enabled"),
                rs.getBoolean("updates_enabled"), rs.getBoolean("weekly_enabled"), rs.getBoolean("photo_enabled"),
                rs.getTime("photo_time").toLocalTime().toString(), rs.getBoolean("challenge_enabled"),
                rs.getTime("challenge_time").toLocalTime().toString()), userId).stream().findFirst()
                .orElse(new Prefs(true, "08:00", false, "1,3,5", "18:00", true, false, true, true, true, "19:00", true, "20:00"));
    }
}
