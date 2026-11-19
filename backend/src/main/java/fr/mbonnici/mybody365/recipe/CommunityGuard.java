package fr.mbonnici.mybody365.recipe;

import fr.mbonnici.mybody365.config.AppProperties;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The community is published by the admins only (1.7). At each start, a recipe a member had shown to everyone before
 * goes back to their friends (nothing deleted): the admins are those of the database and those of ADMIN_EMAILS.
 */
@Component
public class CommunityGuard {

    private static final Logger log = LoggerFactory.getLogger(CommunityGuard.class);

    private final JdbcTemplate jdbc;
    private final AppProperties props;

    CommunityGuard(JdbcTemplate jdbc, AppProperties props) {
        this.jdbc = jdbc;
        this.props = props;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        try {
            run();
        } catch (RuntimeException e) {
            log.warn("Community check failed: {}", e.getMessage());
        }
    }

    /** how many recipes went back to friends (public for the tests) */
    public int run() {
        List<Map<String, Object>> owners = jdbc.queryForList("""
                select distinct u.id, u.email, u.role from recipe r join app_user u on u.id = r.owner_id where r.visibility = 'PUBLIC'""");
        int moved = 0;
        for (Map<String, Object> o : owners) {
            // the team's own recipes (CommunityRecipes) are the community's first ones
            boolean admin = "ADMIN".equals(o.get("role")) || "BOT".equals(o.get("role")) || props.isAdminEmail((String) o.get("email"))
                    || CommunityRecipes.TEAM_EMAIL.equals(o.get("email"));
            if (!admin) {
                moved += jdbc.update("update recipe set visibility = 'FRIENDS', shared = false where owner_id = ? and visibility = 'PUBLIC'",
                        (UUID) o.get("id"));
            }
        }
        if (moved > 0) {
            log.info("{} community recipe(s) of members back to their friends", moved);
        }
        return moved;
    }
}
