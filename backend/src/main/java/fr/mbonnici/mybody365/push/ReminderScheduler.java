package fr.mbonnici.mybody365.push;

import fr.mbonnici.mybody365.push.PushService.Kind;
import fr.mbonnici.mybody365.tracking.TrackingService;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Every minute (Paris time): the daily reminder of whoever set it for now and has not weighed in (or
 * taken the photo) yet. Each one goes at most once a day. (The gym reminders went with the workout programs in 0.8.)
 */
@Component
public class ReminderScheduler {

    private static final Logger log = LoggerFactory.getLogger(ReminderScheduler.class);

    private final JdbcTemplate jdbc;
    private final PushService push;

    public ReminderScheduler(JdbcTemplate jdbc, PushService push) {
        this.jdbc = jdbc;
        this.push = push;
    }

    @Scheduled(cron = "0 * * * * *", zone = "Europe/Paris")
    public void tick() {
        ZonedDateTime now = ZonedDateTime.now(TrackingService.ZONE);
        run(now.toLocalDate(), now.toLocalTime().truncatedTo(ChronoUnit.MINUTES));
    }

    /** one minute of reminders (public for the tests) */
    public void run(LocalDate today, LocalTime minute) {
        try {
            daily(today, minute);
        } catch (RuntimeException e) {
            log.warn("Reminders failed: {}", e.getMessage());
        }
    }

    private void daily(LocalDate today, LocalTime minute) {
        List<UUID> due = jdbc.queryForList("""
                select p.user_id from notification_pref p
                where p.daily_enabled and p.daily_time = ? and (p.last_daily is null or p.last_daily < ?)
                  and exists (select 1 from push_subscription s where s.user_id = p.user_id)""", UUID.class, minute, today);
        for (UUID user : due) {
            jdbc.update("update notification_pref set last_daily = ? where user_id = ?", today, user);
            boolean weighed = exists("select 1 from body_log where user_id = ? and day = ? and weight_kg is not null", user, today);
            boolean photo = exists("select 1 from photo where user_id = ? and day = ?", user, today);
            if (!weighed) {
                push.notify(user, Kind.DAILY_WEIGH, Map.of("days", Integer.toString(streak(user, today))));
            } else if (!photo) {
                push.notify(user, Kind.DAILY_PHOTO, Map.of());
            }
        }
    }


    /** days in a row up to yesterday (today is what the reminder is about) */
    private int streak(UUID user, LocalDate today) {
        int n = 0;
        for (LocalDate d = today.minusDays(1); n < 400; d = d.minusDays(1)) {
            if (!exists("select 1 from body_log where user_id = ? and day = ? and weight_kg is not null", user, d)) {
                break;
            }
            n++;
        }
        return n;
    }

    private boolean exists(String sql, Object... args) {
        return !jdbc.queryForList(sql, Integer.class, args).isEmpty();
    }
}
