package fr.mbonnici.mybody365.push;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The workout timer on a locked screen or behind another app (1.7): a phone stops the page then, so the app hands the
 * coming changes of phase to the server when it leaves the screen, and takes them back when it returns. Each one is a
 * notification at its time (« Repos », « C'est reparti », « Séance terminée »). Kept in memory only: a restart of the
 * server loses them, which costs a missed alert, never a wrong one.
 */
@RestController
public class TimerAlerts {

    private static final Logger log = LoggerFactory.getLogger(TimerAlerts.class);
    /** a run is at most 30 rounds of an hour: further than that is not a timer */
    static final Duration HORIZON = Duration.ofHours(4);

    public enum Phase { WORK, REST, DONE }

    public record Alert(@NotNull Instant at, @NotNull Phase phase, @Min(1) @Max(30) int round, @Min(1) @Max(30) int total) {}

    public record Alerts(@NotNull @Size(max = 64) List<@Valid @NotNull Alert> alerts) {}

    private final PushService push;
    private final UserService users;
    private final TaskScheduler scheduler;
    private final Map<UUID, List<ScheduledFuture<?>>> pending = new ConcurrentHashMap<>();

    public TimerAlerts(PushService push, UserService users, TaskScheduler scheduler) {
        this.push = push;
        this.users = users;
        this.scheduler = scheduler;
    }

    /** the coming changes of phase, replacing the ones given before */
    @PutMapping("/api/me/timer/alerts")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void schedule(@Valid @RequestBody Alerts body, Authentication auth) {
        schedule(users.current(auth).getId(), body.alerts());
    }

    /** back on screen, paused or stopped: the app beeps by itself again */
    @DeleteMapping("/api/me/timer/alerts")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(Authentication auth) {
        cancel(users.current(auth).getId());
    }

    void schedule(UUID userId, List<Alert> alerts) {
        Instant now = Instant.now();
        for (Alert a : alerts) {
            if (a.at().isAfter(now.plus(HORIZON)) || a.round() > a.total()) {
                throw ApiException.badRequest("timer_alert_invalid");
            }
        }
        List<ScheduledFuture<?>> futures = new ArrayList<>();
        for (Alert a : alerts) {
            // one already past (the request took a moment): sent at once, still useful
            Instant at = a.at().isBefore(now) ? now : a.at();
            futures.add(scheduler.schedule(() -> send(userId, a), at));
        }
        List<ScheduledFuture<?>> before = pending.put(userId, futures);
        if (before != null) {
            before.forEach(f -> f.cancel(false));
        }
    }

    void cancel(UUID userId) {
        List<ScheduledFuture<?>> before = pending.remove(userId);
        if (before != null) {
            before.forEach(f -> f.cancel(false));
        }
    }

    /** how many alerts are still to come for this account (the tests) */
    int waiting(UUID userId) {
        return (int) pending.getOrDefault(userId, List.of()).stream().filter(f -> !f.isDone()).count();
    }

    private void send(UUID userId, Alert a) {
        try {
            push.notify(userId, PushService.Kind.TIMER,
                    Map.of("phase", a.phase().name(), "round", String.valueOf(a.round()), "total", String.valueOf(a.total())));
        } catch (RuntimeException e) {
            log.info("Timer alert not sent: {}", e.getMessage());
        }
    }
}
