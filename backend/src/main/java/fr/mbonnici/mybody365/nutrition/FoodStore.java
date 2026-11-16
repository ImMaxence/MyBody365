package fr.mbonnici.mybody365.nutrition;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** The food table, in plain SQL (searches and Ciqual imports are easier to keep fast this way). */
@Repository
public class FoodStore {

    public enum Source { CIQUAL, OFF, USER }

    /** a food and its nutrients per 100 g */
    public record Food(UUID id, Source source, String sourceCode, UUID ownerId, String name, String brand, String category,
            Nutrients per100, String nutriscore, boolean nutriscoreEstimated, Double servingG, boolean superseded, Instant updatedAt) {}

    private static final String COLUMNS = """
            id, source, source_code, owner_id, name, brand, category, kcal, protein_g, carbs_g, sugars_g, fat_g, sat_fat_g,
            fiber_g, salt_g, nutriscore, nutriscore_estimated, serving_g, superseded, updated_at""";

    private final JdbcTemplate jdbc;

    public FoodStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    static Food map(ResultSet rs, int i) throws SQLException {
        String owner = rs.getString("owner_id");
        return new Food(rs.getObject("id", UUID.class), Source.valueOf(rs.getString("source")), rs.getString("source_code"),
                owner == null ? null : UUID.fromString(owner), rs.getString("name"), rs.getString("brand"), rs.getString("category"),
                Nutrients.from(rs), rs.getString("nutriscore"), rs.getBoolean("nutriscore_estimated"), Nutrients.num(rs, "serving_g"),
                rs.getBoolean("superseded"), rs.getTimestamp("updated_at").toInstant());
    }

    public Optional<Food> find(UUID id) {
        return jdbc.query("select " + COLUMNS + " from food where id = ?", FoodStore::map, id).stream().findFirst();
    }

    public Optional<Food> findOff(String code) {
        return jdbc.query("select " + COLUMNS + " from food where source = 'OFF' and source_code = ?", FoodStore::map, code).stream()
                .findFirst();
    }

    /**
     * Foods whose name holds every word: the account's own first, then Ciqual, then the cached Open Food
     * Facts products; names starting with the first word and short names come first.
     */
    public List<Food> search(UUID userId, List<String> words, boolean includeOff, int limit) {
        if (words.isEmpty()) {
            return List.of();
        }
        StringBuilder sql = new StringBuilder("select " + COLUMNS + " from food where ((source = 'USER' and owner_id = ?)"
                + " or (source = 'CIQUAL' and not superseded)" + (includeOff ? " or source = 'OFF'" : "") + ")");
        List<Object> args = new ArrayList<>();
        args.add(userId);
        for (String w : words) {
            sql.append(" and search_name like ?");
            args.add(SearchText.contains(w));
        }
        sql.append(" order by case source when 'USER' then 0 when 'CIQUAL' then 1 else 2 end,")
                .append(" case when search_name like ? then 0 else 1 end, length(search_name) limit ?");
        args.add(words.getFirst().replace("%", "\\%").replace("_", "\\_") + "%");
        args.add(limit);
        return jdbc.query(sql.toString(), FoodStore::map, args.toArray());
    }

    public List<Food> ownedBy(UUID userId) {
        return jdbc.query("select " + COLUMNS + " from food where source = 'USER' and owner_id = ? order by lower(name)", FoodStore::map,
                userId);
    }

    public UUID insert(Source source, String code, String version, UUID ownerId, String name, String nameEn, String brand,
            String category, Nutrients n, String nutriscore, boolean estimated, Double servingG) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into food (id, source, source_code, source_version, owner_id, name, name_en, brand, category, search_name, kcal,
                  protein_g, carbs_g, sugars_g, fat_g, sat_fat_g, fiber_g, salt_g, nutriscore, nutriscore_estimated, serving_g)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                id, source.name(), code, version, ownerId, name, nameEn, brand, category, searchName(name, nameEn, brand), n.kcal(),
                n.proteinG(), n.carbsG(), n.sugarsG(), n.fatG(), n.satFatG(), n.fiberG(), n.saltG(), nutriscore, estimated, servingG);
        return id;
    }

    public void update(UUID id, String name, String brand, Nutrients n, String nutriscore, boolean estimated, Double servingG) {
        jdbc.update("""
                update food set name = ?, brand = ?, search_name = ?, kcal = ?, protein_g = ?, carbs_g = ?, sugars_g = ?, fat_g = ?,
                  sat_fat_g = ?, fiber_g = ?, salt_g = ?, nutriscore = ?, nutriscore_estimated = ?, serving_g = ?, updated_at = ?
                where id = ?""",
                name, brand, searchName(name, null, brand), n.kcal(), n.proteinG(), n.carbsG(), n.sugarsG(), n.fatG(), n.satFatG(),
                n.fiberG(), n.saltG(), nutriscore, estimated, servingG, Timestamp.from(Instant.now()), id);
    }

    public void delete(UUID id) {
        jdbc.update("delete from food where id = ?", id);
    }

    static String searchName(String name, String nameEn, String brand) {
        return SearchText.normalize(name + (brand == null ? "" : " " + brand) + (nameEn == null ? "" : " " + nameEn));
    }
}
