package fr.mbonnici.mybody365.push;

import fr.mbonnici.mybody365.push.PushService.Kind;
import fr.mbonnici.mybody365.push.PushService.Subscription;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalTime;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
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
            boolean friendsEnabled) {}

    public record Settings(String publicKey, int devices, Prefs prefs) {}

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
        jdbc.update("""
                insert into notification_pref (user_id, daily_enabled, daily_time, gym_enabled, gym_days, gym_time, friends_enabled)
                values (?, ?, ?, ?, ?, ?, ?)
                on conflict (user_id) do update set daily_enabled = excluded.daily_enabled, daily_time = excluded.daily_time,
                  gym_enabled = excluded.gym_enabled, gym_days = excluded.gym_days, gym_time = excluded.gym_time,
                  friends_enabled = excluded.friends_enabled""",
                me, p.dailyEnabled(), LocalTime.parse(p.dailyTime()), p.gymEnabled(), p.gymDays(), LocalTime.parse(p.gymTime()),
                p.friendsEnabled());
        return settings(auth);
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
                rs.getTime("gym_time").toLocalTime().toString(), rs.getBoolean("friends_enabled")), userId).stream().findFirst()
                .orElse(new Prefs(true, "08:00", false, "1,3,5", "18:00", true));
    }
}
