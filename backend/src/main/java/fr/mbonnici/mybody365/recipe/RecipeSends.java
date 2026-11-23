package fr.mbonnici.mybody365.recipe;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.friends.FriendService;
import fr.mbonnici.mybody365.push.PushService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 1.19: a recipe sent to friends from its page. Each one gets a notification that opens it in the app (an iPhone
 * too: a link sent by message opens Safari, never the app of the home screen, while a tap on a notification opens
 * the app on the recipe), and the notification centre keeps it. Only to friends, only a recipe they may open (shown
 * to everyone, or to the friends of its owner), 10 friends a time at most, the same recipe to the same friend once in
 * 10 minutes (a second tap says it is sent, nothing leaves), 40 a day for a member. A friend who turned the friends'
 * notifications off finds it in the notification centre only.
 */
@Component
public class RecipeSends {

    private static final Logger log = LoggerFactory.getLogger(RecipeSends.class);
    static final int MAX_FRIENDS = 10;
    static final int MAX_A_DAY = 40;
    private static final Duration AGAIN_AFTER = Duration.ofMinutes(10);

    private final JdbcTemplate jdbc;
    private final RecipeService recipes;
    private final FriendService friends;
    private final PushService push;
    private final TaskExecutor executor;
    private final Clock clock;
    /** « sender recipient recipe » → when it was last sent */
    private final Map<String, Instant> lastSent = new ConcurrentHashMap<>();
    /** a member's sends of the last day */
    private final Map<UUID, Deque<Instant>> sends = new ConcurrentHashMap<>();

    public RecipeSends(JdbcTemplate jdbc, RecipeService recipes, FriendService friends, PushService push,
            @Qualifier("applicationTaskExecutor") TaskExecutor executor) {
        this.jdbc = jdbc;
        this.recipes = recipes;
        this.friends = friends;
        this.push = push;
        this.executor = executor;
        this.clock = Clock.systemUTC();
    }

    /** the friends it went to (those it had already gone to in the last 10 minutes count, nothing leaves again) */
    public int send(UUID senderId, UUID recipeId, List<UUID> to) {
        if (to == null || to.isEmpty() || to.size() > MAX_FRIENDS) {
            throw ApiException.badRequest("validation_failed");
        }
        RecipeService.RecipeRow r = recipes.viewable(recipeId, senderId, false);
        if (r.visibility() == RecipeService.Visibility.PRIVATE || r.hidden()) {
            throw ApiException.conflict("recipe_private");
        }
        Set<UUID> targets = new LinkedHashSet<>(to);
        targets.remove(senderId);
        if (targets.isEmpty()) {
            throw ApiException.badRequest("validation_failed");
        }
        for (UUID t : targets) {
            if (!friends.friends(senderId, t)) {
                throw ApiException.forbidden("not_friends");
            }
            // shown to its owner's friends only: each one must be among them (or be its owner)
            if (r.visibility() == RecipeService.Visibility.FRIENDS && !r.ownerId().equals(t) && !friends.friends(r.ownerId(), t)) {
                throw ApiException.conflict("recipe_not_visible");
            }
        }
        Instant now = clock.instant();
        List<UUID> fresh = targets.stream().filter(t -> {
            Instant last = lastSent.get(key(senderId, t, recipeId));
            return last == null || last.plus(AGAIN_AFTER).isBefore(now);
        }).toList();
        Deque<Instant> mine = sends.computeIfAbsent(senderId, k -> new ArrayDeque<>());
        synchronized (mine) {
            while (!mine.isEmpty() && mine.peekFirst().isBefore(now.minus(Duration.ofDays(1)))) {
                mine.pollFirst();
            }
            if (mine.size() + fresh.size() > MAX_A_DAY) {
                throw ApiException.conflict("too_many_sends");
            }
            fresh.forEach(t -> mine.addLast(now));
        }
        if (fresh.isEmpty()) {
            return targets.size();
        }
        fresh.forEach(t -> lastSent.put(key(senderId, t, recipeId), now));
        String displayName = jdbc.queryForList("select display_name from app_user where id = ?", String.class, senderId).stream().findFirst().orElse("");
        Map<String, String> args = Map.of("name", firstName(displayName), "recipe", r.name(), "path", "/app/meals/recipes/" + recipeId);
        List<UUID> pushed = fresh.stream().filter(t -> Boolean.TRUE.equals(jdbc.queryForObject(
                "select coalesce((select friends_enabled from notification_pref where user_id = ?), true)", Boolean.class, t))).toList();
        executor.execute(() -> {
            for (UUID t : fresh) {
                try {
                    if (pushed.contains(t)) {
                        push.notify(t, PushService.Kind.RECIPE_SENT, args);
                    } else {
                        push.keepOnly(t, PushService.Kind.RECIPE_SENT, args);
                    }
                } catch (RuntimeException e) {
                    log.info("Recipe not sent: {}", e.getMessage());
                }
            }
        });
        return targets.size();
    }

    private static String key(UUID sender, UUID to, UUID recipe) {
        return sender + " " + to + " " + recipe;
    }

    private static String firstName(String displayName) {
        String first = displayName == null ? "" : displayName.strip().split("\\s+")[0];
        return first.length() > 40 ? first.substring(0, 40) : first;
    }
}
