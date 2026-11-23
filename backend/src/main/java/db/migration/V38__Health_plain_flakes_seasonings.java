package db.migration;

import fr.mbonnici.mybody365.nutrition.FoodStore;
import fr.mbonnici.mybody365.nutrition.HealthScore;
import fr.mbonnici.mybody365.nutrition.Nutrients;
import fr.mbonnici.mybody365.nutrition.ProductInfo;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.UUID;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * 1.20.5: the health score of plain foods filed by Ciqual among industrial ones (oat flakes among the breakfast cereals:
 * a raw food, 9 in place of 6.5) and of what is put in by the pinch (salt, spices: no score of their own). The meal lines
 * already noted with them get the score their food has now, as a new line would.
 */
public class V38__Health_plain_flakes_seasonings extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        try (Statement st = context.getConnection().createStatement();
                ResultSet rs = st.executeQuery("""
                        select e.id, f.source, f.name, f.category, f.kcal, f.protein_g, f.carbs_g, f.sugars_g, f.fat_g, f.sat_fat_g, f.fiber_g, f.salt_g
                        from meal_entry e join food f on f.id = e.food_id
                        where f.source = 'CIQUAL' and lower(f.category) in ('céréales de petit-déjeuner', 'biscuits apéritifs', 'barres céréalières',
                          'épices', 'sels', 'aides culinaires')""");
                PreparedStatement up = context.getConnection().prepareStatement("update meal_entry set health = ? where id = ?")) {
            int n = 0;
            while (rs.next()) {
                Nutrients per100 = Nutrients.from(rs);
                HealthScore.Result h = HealthScore.score(HealthScore.of(FoodStore.Source.CIQUAL, rs.getString("name"), rs.getString("category"), per100,
                        ProductInfo.NONE));
                up.setObject(1, h == null ? null : h.score());
                up.setObject(2, rs.getObject("id", UUID.class));
                up.addBatch();
                if (++n % 500 == 0) {
                    up.executeBatch();
                }
            }
            up.executeBatch();
        }
    }
}
