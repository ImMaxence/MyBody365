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
 * water" for whoever turned it on and is behind on their glasses; on Sunday at 19:00, the summary of the
 * week for whoever was active in it. (The gym reminders went with the workout programs in 1.0.)
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
            weekly(today, minute);
        } catch (RuntimeException e) {
            log.warn("Weekly summaries failed: {}", e.getMessage());
        }
    }

    static final LocalTime WEEKLY_AT = LocalTime.of(19, 0);

    /**
     * Sunday at 19:00: « Ton bilan de la semaine » for whoever has a device, did not turn it off, and weighed in
     * or noted a meal in the last 7 days (a quiet account is left alone). Once a week; its text says nothing
     * personal, the figures are in the app (/app/week).
     */
    private void weekly(LocalDate today, LocalTime minute) {
        if (today.getDayOfWeek() != java.time.DayOfWeek.SUNDAY || !minute.equals(WEEKLY_AT)) {
            return;
        }
        LocalDate since = today.minusDays(7);
        List<UUID> due = jdbc.queryForList("""
                select s.user_id from (select distinct user_id from push_subscription) s
                left join notification_pref p on p.user_id = s.user_id
                where coalesce(p.weekly_enabled, true) and (p.last_weekly is null or p.last_weekly < ?)
                  and (exists (select 1 from body_log b where b.user_id = s.user_id and b.day > ? and b.weight_kg is not null)
                    or exists (select 1 from meal_entry m where m.user_id = s.user_id and m.day > ?))""", UUID.class, today, since, since);
        for (UUID user : due) {
            jdbc.update("insert into notification_pref (user_id) values (?) on conflict (user_id) do nothing", user);
            // claimed first: two instances never send it twice
            int claimed = jdbc.update("update notification_pref set last_weekly = ? where user_id = ? and (last_weekly is null or last_weekly < ?)",
                    today, user, today);
            if (claimed == 1) {
                push.notify(user, Kind.WEEKLY, Map.of());
            }
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
