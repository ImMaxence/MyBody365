package db.migration;

import fr.mbonnici.mybody365.nutrition.Nutrients;
import fr.mbonnici.mybody365.nutrition.Nutriscore;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * 1.7: a recipe's Nutri-Score counts its share of fruit, vegetables and legumes. The recipes computed from their
 * ingredients get their grade again, once, from the values copied in recipe_ingredient (nothing else changes).
 */
public class V20__Recipe_fruit_veg_grades extends BaseJavaMigration {

    private static final class Sum {
        Nutrients total = Nutrients.ZERO;
        double grams;
        double fruitVeg;
    }

    @Override
    public void migrate(Context context) throws Exception {
        Map<UUID, Sum> sums = new LinkedHashMap<>();
        try (Statement st = context.getConnection().createStatement();
                ResultSet rs = st.executeQuery("""
                        select ri.recipe_id, ri.grams, ri.kcal, ri.protein_g, ri.carbs_g, ri.sugars_g, ri.fat_g, ri.sat_fat_g, ri.fiber_g, ri.salt_g,
                          f.category
                        from recipe_ingredient ri join recipe r on r.id = ri.recipe_id left join food f on f.id = ri.food_id
                        where not coalesce(r.manual_nutrition, false)""")) {
            while (rs.next()) {
                Sum s = sums.computeIfAbsent(rs.getObject("recipe_id", UUID.class), k -> new Sum());
                double grams = rs.getDouble("grams");
                s.total = s.total.plus(Nutrients.from(rs).times(grams / 100));
                s.grams += grams;
                if (Nutriscore.fruitVeg(rs.getString("category"))) {
                    s.fruitVeg += grams;
                }
            }
        }
        try (PreparedStatement up = context.getConnection().prepareStatement("update recipe set nutriscore = ? where id = ?")) {
            for (Map.Entry<UUID, Sum> e : sums.entrySet()) {
                Sum s = e.getValue();
                if (s.grams <= 0) {
                    continue;
                }
                up.setString(1, Nutriscore.grade(s.total.times(100 / s.grams), 100 * s.fruitVeg / s.grams));
                up.setObject(2, e.getKey());
                up.addBatch();
            }
            up.executeBatch();
        }
    }
}
