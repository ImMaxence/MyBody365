package fr.mbonnici.mybody365.push;

import fr.mbonnici.mybody365.tracking.TrackingService;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 1.19: the reminders of the weigh-in and of the photo at the time one does them (an option of the notifications): the
 * middle time of the weigh-ins (and of the photos) of the last 14 days, each noted on its own day, plus 20 minutes (the
 * reminder comes when it is usually done, if it is not), on a 5-minute step, between 5:00 and 22:55. Fewer than 5 days:
 * not known, the time chosen in the settings counts. Worked out each night, and as soon as the option is turned on.
 */
@Component
public class SmartTimes {

    private static final Logger log = LoggerFactory.getLogger(SmartTimes.class);

    static final int DAYS = 14;
    static final int MIN_DAYS = 5;
    static final int AFTER_MINUTES = 20;

    private final JdbcTemplate jdbc;

    public SmartTimes(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Scheduled(cron = "0 30 3 * * *", zone = "Europe/Paris")
    public void nightly() {
        for (UUID user : jdbc.queryForList("select user_id from notification_pref where smart_time", UUID.class)) {
            try {
                compute(user);
            } catch (RuntimeException e) {
                log.warn("Usual reminder times not worked out: {}", e.getMessage());
            }
        }
    }

    public void compute(UUID user) {
        var since = TrackingService.today().minusDays(DAYS);
        List<Integer> weighs = jdbc.queryForList("""
                select (extract(hour from created_at at time zone 'Europe/Paris') * 60 + extract(minute from created_at at time zone 'Europe/Paris'))::int
                from body_log where user_id = ? and day > ? and weight_kg is not null and (created_at at time zone 'Europe/Paris')::date = day""",
                Integer.class, user, since);
        List<Integer> photos = jdbc.queryForList("""
                select (extract(hour from created_at at time zone 'Europe/Paris') * 60 + extract(minute from created_at at time zone 'Europe/Paris'))::int
                from photo where user_id = ? and day > ? and (created_at at time zone 'Europe/Paris')::date = day""", Integer.class, user, since);
        jdbc.update("update notification_pref set smart_daily_time = ?, smart_photo_time = ? where user_id = ?", usual(weighs), usual(photos), user);
    }

    /** the middle time of the days, 20 minutes later, on a 5-minute step; null with fewer than MIN_DAYS */
    static LocalTime usual(List<Integer> minutes) {
        if (minutes == null || minutes.size() < MIN_DAYS) {
            return null;
        }
        List<Integer> sorted = new ArrayList<>(minutes);
        Collections.sort(sorted);
        int n = sorted.size();
        double middle = n % 2 == 1 ? sorted.get(n / 2) : (sorted.get(n / 2 - 1) + sorted.get(n / 2)) / 2.0;
        int at = (int) Math.round((middle + AFTER_MINUTES) / 5.0) * 5;
        at = Math.max(5 * 60, Math.min(22 * 60 + 55, at));
        return LocalTime.of(at / 60, at % 60);
    }
}
