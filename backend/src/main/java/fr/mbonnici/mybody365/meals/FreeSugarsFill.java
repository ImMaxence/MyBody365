package fr.mbonnici.mybody365.meals;

import fr.mbonnici.mybody365.nutrition.FreeSugars;
import fr.mbonnici.mybody365.nutrition.FoodStore;
import fr.mbonnici.mybody365.nutrition.HealthScore;
import java.util.ArrayList;
import java.util.HashMap;
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
 * 1.20: at start, the free sugars of what was there before them (all of it again when the rules change): the recipes made of
 * foods, per serving, then the meal lines (a food's share of free sugars, its recipe's, all the sugars of a quick portion). The
 * recipes made of foods also learn whether they are fried from their ingredients (HealthScore.friedRecipe).
 */
@Component
public class FreeSugarsFill {

    private static final Logger log = LoggerFactory.getLogger(FreeSugarsFill.class);
    static final String STATE_KEY = "free_sugars_rules";
    /** bump to estimate everything again */
    static final String RULES = "1";

    private final JdbcTemplate jdbc;

    FreeSugarsFill(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void atStart() {
        try {
            String done = jdbc.queryForList("select value from app_state where name = ?", String.class, STATE_KEY).stream().findFirst().orElse(null);
            boolean all = !RULES.equals(done);
            fill(all);
            if (all) {
                jdbc.update("""
                        insert into app_state (name, value, updated_at) values (?, ?, now())
                        on conflict (name) do update set value = excluded.value, updated_at = now()""", STATE_KEY, RULES);
            }
        } catch (RuntimeException e) {
            log.warn("Free sugars not estimated: {}", e.getMessage());
        }
    }

    /** what lacks them (the recipes and meal lines a backup brought back) */
    public static void fillMissing(JdbcTemplate jdbc) {
        new FreeSugarsFill(jdbc).fill(false);
    }

    void fill(boolean all) {
        // the recipes made of foods: the sum of their ingredients' free sugars, per serving
        Map<UUID, double[]> perRecipe = new HashMap<>();
        // fried: [grams, fat grams, a fried food (1), the dish's name says fried (1)]
        Map<UUID, double[]> fried = new HashMap<>();
        jdbc.query("""
                select ri.recipe_id, ri.grams, f.source, f.category, f.name, f.pnns, f.sugars_g, r.servings, r.name as recipe_name
                from recipe_ingredient ri join recipe r on r.id = ri.recipe_id join food f on f.id = ri.food_id
                where not r.manual_nutrition""" + (all ? "" : " and (r.free_sugars_g is null or r.fried is null)"), rs -> {
            UUID recipe = rs.getObject("recipe_id", UUID.class);
            double g = rs.getDouble("grams");
            double[] fr = fried.computeIfAbsent(recipe, k -> new double[] {0, 0, 0, 0});
            fr[0] += g;
            if (HealthScore.fat(rs.getString("category"), rs.getString("pnns"), rs.getString("name"))) {
                fr[1] += g;
            }
            if (HealthScore.fried(rs.getString("name"))) {
                fr[2] = 1;
            }
            if (HealthScore.fried(rs.getString("recipe_name"))) {
                fr[3] = 1;
            }
            double sugars = rs.getDouble("sugars_g");
            if (rs.wasNull()) {
                return;
            }
            double free = FreeSugars.per100(FoodStore.Source.valueOf(rs.getString("source")), rs.getString("category"), rs.getString("name"),
                    rs.getString("pnns"), sugars) * rs.getDouble("grams") / 100;
            double[] acc = perRecipe.computeIfAbsent(rs.getObject("recipe_id", UUID.class), k -> new double[] {0, 1});
            acc[0] += free;
            acc[1] = Math.max(1, rs.getInt("servings"));
        });
        List<Object[]> recipes = new ArrayList<>();
        perRecipe.forEach((id, acc) -> recipes.add(new Object[] {Math.round(acc[0] / acc[1] * 100) / 100.0, id}));
        jdbc.batchUpdate("update recipe set free_sugars_g = ? where id = ?", recipes);
        List<Object[]> frying = new ArrayList<>();
        fried.forEach((id, f) -> frying.add(new Object[] {f[2] > 0 || (f[3] > 0 && f[0] > 0 && f[1] / f[0] >= 0.05), id}));
        jdbc.batchUpdate("update recipe set fried = ? where id = ?", frying);

        String which = all ? "" : " and e.free_sugars_g is null";
        List<Object[]> lines = new ArrayList<>();
        // a food's line: its sugars as noted, times the food's share of free sugars
        jdbc.query("""
                select e.id, e.sugars_g, f.source, f.category, f.name, f.pnns, f.sugars_g as food_sugars
                from meal_entry e join food f on f.id = e.food_id where e.sugars_g is not null""" + which, rs -> {
            double foodSugars = rs.getDouble("food_sugars");
            boolean unknown = rs.wasNull();
            double sugars = rs.getDouble("sugars_g");
            double share = unknown || foodSugars <= 0 ? 1 : FreeSugars.per100(FoodStore.Source.valueOf(rs.getString("source")),
                    rs.getString("category"), rs.getString("name"), rs.getString("pnns"), foodSugars) / foodSugars;
            lines.add(new Object[] {Math.round(sugars * share * 100) / 100.0, rs.getObject("id", UUID.class)});
        });
        // a recipe's line: the recipe's share
        jdbc.query("""
                select e.id, e.sugars_g, r.free_sugars_g, r.sugars_g as recipe_sugars
                from meal_entry e join recipe r on r.id = e.recipe_id where e.sugars_g is not null""" + which, rs -> {
            double sugars = rs.getDouble("sugars_g");
            double free = rs.getDouble("free_sugars_g");
            boolean noFree = rs.wasNull();
            double recipeSugars = rs.getDouble("recipe_sugars");
            double share = noFree || recipeSugars <= 0 ? 1 : Math.min(1, free / recipeSugars);
            lines.add(new Object[] {Math.round(sugars * share * 100) / 100.0, rs.getObject("id", UUID.class)});
        });
        jdbc.batchUpdate("update meal_entry set free_sugars_g = ? where id = ?", lines);
        // a quick portion, a line whose food or recipe is gone: all its sugars
        jdbc.update("""
                update meal_entry e set free_sugars_g = sugars_g
                where sugars_g is not null and (e.food_id is null or not exists (select 1 from food f where f.id = e.food_id))
                  and (e.recipe_id is null or not exists (select 1 from recipe r where r.id = e.recipe_id))""" + which);
        log.info("Free sugars estimated: {} recipes, {} meal lines", recipes.size(), lines.size());
    }
}
