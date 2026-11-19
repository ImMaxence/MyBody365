package fr.mbonnici.mybody365.push;

import fr.mbonnici.mybody365.push.PushService.Kind;
import fr.mbonnici.mybody365.tracking.TrackingService;
import java.sql.Timestamp;
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
 * taken the photo) yet, each one at most once a day; and at 10:00, 13:00, 16:00 and 19:00, "drink some
 * water" for whoever turned it on and is behind on their glasses; and, for whoever asked for it (1.11), the photo of
 * the day at its own time if not taken yet. (The gym reminders went with the workout programs in 1.0.)
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
        try {
            water(today, minute);
        } catch (RuntimeException e) {
            log.warn("Water reminders failed: {}", e.getMessage());
        }
        try {
            photo(today, minute);
        } catch (RuntimeException e) {
            log.warn("Photo reminders failed: {}", e.getMessage());
        }
    }

    /** when "drink some water" may go out (Paris time) */
    static final List<LocalTime> WATER_SLOTS = List.of(LocalTime.of(10, 0), LocalTime.of(13, 0), LocalTime.of(16, 0), LocalTime.of(19, 0));

    /** the glasses expected by this time: the day's goal spread evenly from 8:00 to 21:00 */
    public static int expectedGlasses(int goal, LocalTime at) {
        double share = Math.clamp((at.toSecondOfDay() - 8 * 3600) / (13.0 * 3600), 0, 1);
        return (int) Math.ceil(goal * share - 1e-9);
    }

    /** at each slot, whoever asked for it and is behind on their glasses; at most once per slot */
    private void water(LocalDate today, LocalTime minute) {
        if (!WATER_SLOTS.contains(minute)) {
            return;
        }
        Timestamp slot = Timestamp.from(today.atTime(minute).atZone(TrackingService.ZONE).toInstant());
        List<Map<String, Object>> due = jdbc.queryForList("""
                select p.user_id, u.water_goal, coalesce(w.glasses, 0) as glasses
                from notification_pref p
                join app_user u on u.id = p.user_id
                left join water_log w on w.user_id = p.user_id and w.day = ?
                where p.water_enabled and u.water_goal is not null and (p.last_water is null or p.last_water < ?)
                  and exists (select 1 from push_subscription s where s.user_id = p.user_id)""", today, slot);
        for (Map<String, Object> row : due) {
            UUID user = (UUID) row.get("user_id");
            int goal = ((Number) row.get("water_goal")).intValue();
            int glasses = ((Number) row.get("glasses")).intValue();
            // claimed first: two instances never send it twice
            int claimed = jdbc.update("update notification_pref set last_water = ? where user_id = ? and (last_water is null or last_water < ?)",
                    slot, user, slot);
            if (claimed == 1 && glasses < expectedGlasses(goal, minute)) {
                push.notify(user, Kind.WATER, Map.of("glasses", Integer.toString(glasses), "goal", Integer.toString(goal)));
            }
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
            } else if (!photo && !photoReminder(user)) {
                push.notify(user, Kind.DAILY_PHOTO, Map.of());
            }
        }
    }

    /** 1.11: the photo of the day has its own reminder, at its own time, only if not taken yet; at most once a day */
    private void photo(LocalDate today, LocalTime minute) {
        List<UUID> due = jdbc.queryForList("""
                select p.user_id from notification_pref p
                where p.photo_enabled and p.photo_time = ? and (p.last_photo is null or p.last_photo < ?)
                  and exists (select 1 from push_subscription s where s.user_id = p.user_id)""", UUID.class, minute, today);
        for (UUID user : due) {
            // claimed first: two instances never send it twice
            int claimed = jdbc.update("update notification_pref set last_photo = ? where user_id = ? and (last_photo is null or last_photo < ?)",
                    today, user, today);
            if (claimed == 1 && !exists("select 1 from photo where user_id = ? and day = ?", user, today)) {
                push.notify(user, Kind.DAILY_PHOTO, Map.of());
            }
        }
    }

    /** the photo has its own reminder: the daily one says nothing of it */
    private boolean photoReminder(UUID user) {
        return exists("select 1 from notification_pref where user_id = ? and photo_enabled", user);
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
