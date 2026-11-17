package fr.mbonnici.mybody365.recipe;

import fr.mbonnici.mybody365.push.PushService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * A new recipe shown to friends (or to everyone) is announced to the owner's friends: « Léa a partagé une
 * recette 🍳 », a tap opens it. Once per recipe (a private one is announced the day it is first shown), not
 * to the friends who turned the friends' notifications off, and at most one an hour per owner (whoever saves
 * five recipes in a row sends one notification, the others show in the friends' tab).
 */
@Component
public class RecipeNews {

    private static final Logger log = LoggerFactory.getLogger(RecipeNews.class);

    private final JdbcTemplate jdbc;
    private final PushService push;
    private final TaskExecutor executor;

    public RecipeNews(JdbcTemplate jdbc, PushService push, @Qualifier("applicationTaskExecutor") TaskExecutor executor) {
        this.jdbc = jdbc;
        this.push = push;
        this.executor = executor;
    }

    /** called once the recipe is saved; the notifications leave after the commit, without making the member wait */
    void saved(UUID ownerId, UUID recipeId) {
        int first = jdbc.update("""
                update recipe set announced_at = now()
                where id = ? and announced_at is null and visibility <> 'PRIVATE' and not hidden""", recipeId);
        if (first == 0) {
            return;
        }
        Integer recent = jdbc.queryForObject("""
                select count(*) from recipe where owner_id = ? and id <> ? and announced_at > now() - interval '1 hour'""",
                Integer.class, ownerId, recipeId);
        if (recent != null && recent > 0) {
            return;
        }
        Map<String, Object> r = jdbc.queryForMap("""
                select r.name, u.display_name from recipe r join app_user u on u.id = r.owner_id where r.id = ?""", recipeId);
        List<UUID> to = jdbc.queryForList("""
                select f.id from (select user_b as id from friendship where user_a = ?
                                  union select user_a from friendship where user_b = ?) f
                left join notification_pref p on p.user_id = f.id
                where coalesce(p.friends_enabled, true)""", UUID.class, ownerId, ownerId);
        if (to.isEmpty()) {
            return;
        }
        Map<String, String> args = Map.of("name", firstName((String) r.get("display_name")), "recipe", (String) r.get("name"),
                "path", "/app/meals/recipes/" + recipeId);
        Runnable send = () -> executor.execute(() -> {
            for (UUID friend : to) {
                try {
                    push.notify(friend, PushService.Kind.FRIEND_RECIPE, args);
                } catch (RuntimeException e) {
                    log.info("Recipe news not sent: {}", e.getMessage());
                }
            }
        });
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send.run();
                }
            });
        } else {
            send.run();
        }
    }

    private static String firstName(String displayName) {
        String first = displayName == null ? "" : displayName.strip().split("\\s+")[0];
        return first.length() > 40 ? first.substring(0, 40) : first;
    }
}
