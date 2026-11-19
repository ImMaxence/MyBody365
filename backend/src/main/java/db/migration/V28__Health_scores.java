package db.migration;

import fr.mbonnici.mybody365.nutrition.FoodStore;
import fr.mbonnici.mybody365.nutrition.HealthScore;
import fr.mbonnici.mybody365.nutrition.Nutrients;
import fr.mbonnici.mybody365.nutrition.ProductInfo;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * 1.13: the health score in place of the Nutri-Score. The recipes computed from their ingredients get their share of
 * fruit, vegetables, legumes and nuts and whether alcohol is in them; the meal lines already noted get the score of their
 * food or recipe, as a new line keeps it (a quick portion keeps its Nutri-Score, read as a score).
 */
public class V28__Health_scores extends BaseJavaMigration {

    private static final class Sum {
        double grams;
        double plants;
        boolean alcohol;
    }

    @Override
    public void migrate(Context context) throws Exception {
        Map<UUID, Sum> sums = new LinkedHashMap<>();
        try (Statement st = context.getConnection().createStatement();
                ResultSet rs = st.executeQuery("""
                        select ri.recipe_id, ri.grams, ri.name, f.category, f.source
                        from recipe_ingredient ri join recipe r on r.id = ri.recipe_id left join food f on f.id = ri.food_id
                        where not coalesce(r.manual_nutrition, false)""")) {
            while (rs.next()) {
                Sum s = sums.computeIfAbsent(rs.getObject("recipe_id", UUID.class), k -> new Sum());
                double grams = rs.getDouble("grams");
                s.grams += grams;
                if (HealthScore.fruitVegCategory(rs.getString("category"))) {
                    s.plants += grams;
                }
                String source = rs.getString("source");
                if (source != null && HealthScore.of(FoodStore.Source.valueOf(source), rs.getString("name"), rs.getString("category"), Nutrients.ZERO,
                        ProductInfo.NONE).alcohol()) {
                    s.alcohol = true;
                }
            }
        }
        try (PreparedStatement up = context.getConnection().prepareStatement("update recipe set fruit_veg = ?, alcohol = ? where id = ?")) {
            for (Map.Entry<UUID, Sum> e : sums.entrySet()) {
                Sum s = e.getValue();
                if (s.grams <= 0) {
                    continue;
                }
                up.setDouble(1, Math.round(1000 * s.plants / s.grams) / 10.0);
                up.setBoolean(2, s.alcohol);
                up.setObject(3, e.getKey());
                up.addBatch();
            }
            up.executeBatch();
        }

        // the lines of a food: judged on the food as it is now (its values per 100 g)
        try (Statement st = context.getConnection().createStatement();
                ResultSet rs = st.executeQuery("""
                        select e.id, f.source, f.name, f.category, f.kcal, f.protein_g, f.carbs_g, f.sugars_g, f.fat_g, f.sat_fat_g, f.fiber_g, f.salt_g
                        from meal_entry e join food f on f.id = e.food_id where e.health is null""");
                PreparedStatement up = context.getConnection().prepareStatement("update meal_entry set health = ?, liquid = ? where id = ?")) {
            int n = 0;
            while (rs.next()) {
                FoodStore.Source source = FoodStore.Source.valueOf(rs.getString("source"));
                Nutrients per100 = Nutrients.from(rs);
                HealthScore.Result h = HealthScore.score(HealthScore.of(source, rs.getString("name"), rs.getString("category"), per100, ProductInfo.NONE));
                up.setObject(1, h == null ? null : h.score());
                up.setBoolean(2, HealthScore.liquid(source, rs.getString("name"), rs.getString("category"), per100, ProductInfo.NONE));
                up.setObject(3, rs.getObject("id", UUID.class));
                up.addBatch();
                if (++n % 500 == 0) {
                    up.executeBatch();
                }
            }
            up.executeBatch();
        }

        // the lines of a recipe: its dish per 100 g
        try (Statement st = context.getConnection().createStatement();
                ResultSet rs = st.executeQuery("""
                        select e.id, r.name, r.type, r.types, r.kcal, r.protein_g, r.carbs_g, r.sugars_g, r.fat_g, r.sat_fat_g, r.fiber_g, r.salt_g,
                          r.serving_g, r.fruit_veg, r.alcohol
                        from meal_entry e join recipe r on r.id = e.recipe_id where e.health is null and r.serving_g is not null""");
                PreparedStatement up = context.getConnection().prepareStatement("update meal_entry set health = ? where id = ?")) {
            while (rs.next()) {
                double serving = rs.getDouble("serving_g");
                if (serving <= 0 || rs.getBoolean("alcohol")) {
                    continue;
                }
                String types = rs.getString("types");
                boolean drink = "DRINK".equals(rs.getString("type")) && (types == null || List.of(types.split(",")).stream().allMatch("DRINK"::equals));
                double fruitVeg = rs.getDouble("fruit_veg");
                Double fv = rs.wasNull() ? null : fruitVeg;
                HealthScore.Result h = HealthScore.score(new HealthScore.Input(Nutrients.from(rs).times(100 / serving), drink, false, false, null, null,
                        false, fv, HealthScore.fried(rs.getString("name"))));
                if (h == null) {
                    continue;
                }
                up.setDouble(1, h.score());
                up.setObject(2, rs.getObject("id", UUID.class));
                up.addBatch();
            }
            up.executeBatch();
        }
    }
}
