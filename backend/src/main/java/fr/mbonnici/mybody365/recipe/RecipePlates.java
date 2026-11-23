package fr.mbonnici.mybody365.recipe;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** 1.18: at start, the plate weight of the recipes that have none yet (all of them when the rules changed) */
@Component
class RecipePlates {

    private static final Logger log = LoggerFactory.getLogger(RecipePlates.class);

    private final JdbcTemplate jdbc;

    RecipePlates(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void atStart() {
        try {
            String done = jdbc.queryForList("select value from app_state where name = ?", String.class, PlateWeight.STATE_KEY).stream()
                    .findFirst().orElse(null);
            boolean all = !PlateWeight.RULES.equals(done);
            PlateWeight.fill(jdbc, all);
            if (all) {
                jdbc.update("""
                        insert into app_state (name, value, updated_at) values (?, ?, now())
                        on conflict (name) do update set value = excluded.value, updated_at = now()""", PlateWeight.STATE_KEY, PlateWeight.RULES);
            }
        } catch (RuntimeException e) {
            log.warn("Plate weights of the recipes not estimated: {}", e.getMessage());
        }
    }
}
