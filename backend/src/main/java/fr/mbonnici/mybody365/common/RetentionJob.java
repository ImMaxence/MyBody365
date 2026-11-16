package fr.mbonnici.mybody365.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The retention periods of the privacy policy, applied every night: handled access requests and reports
 * after twelve months, the admin log (with its IP addresses) after one year, nudges after thirty days.
 */
@Component
public class RetentionJob {

    private static final Logger log = LoggerFactory.getLogger(RetentionJob.class);

    private final JdbcTemplate jdbc;

    public RetentionJob(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Scheduled(cron = "0 15 4 * * *", zone = "Europe/Paris")
    public void purge() {
        int requests = jdbc.update("delete from access_request where status <> 'PENDING' and decided_at < now() - interval '12 months'");
        int reports = jdbc.update("delete from report where status <> 'OPEN' and handled_at < now() - interval '12 months'");
        int audit = jdbc.update("delete from admin_audit where created_at < now() - interval '1 year'");
        int nudges = jdbc.update("delete from friend_nudge where day < current_date - 30");
        if (requests + reports + audit + nudges > 0) {
            log.info("Retention: {} access request(s), {} report(s), {} log line(s), {} nudge(s) deleted", requests, reports, audit, nudges);
        }
    }
}
