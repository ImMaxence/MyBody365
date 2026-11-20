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
            Nutrients per100, String nutriscore, boolean nutriscoreEstimated, Double servingG, boolean superseded, Instant updatedAt,
            /** 1.12: a product's front picture on images.openfoodfacts.org (its path there), and when its page last changed */
            String imagePath, Instant sourceUpdatedAt,
            /** 1.13: a product's size, generic name, food group, processing… (ProductInfo), and how many members noted it this year */
            ProductInfo info, int uses,
            /** 1.14: vitamins and minerals per 100 g (Micros keys), empty when unknown */
            java.util.Map<String, Double> micros,
            /** 1.15: the close food they were taken from when the table had none (MicrosSiblings), else null */
            String microsFrom) {}

    private static final String COLUMNS = """
            id, source, source_code, owner_id, name, brand, category, kcal, protein_g, carbs_g, sugars_g, fat_g, sat_fat_g,
            fiber_g, salt_g, nutriscore, nutriscore_estimated, serving_g, superseded, updated_at, image_path, source_updated_at, quantity,
            generic_name, pnns, nova, additives, sweeteners, fruit_veg, scans, uses, micros::text as micros, micros_from""";

    private final JdbcTemplate jdbc;

    public FoodStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    static Food map(ResultSet rs, int i) throws SQLException {
        String owner = rs.getString("owner_id");
        return new Food(rs.getObject("id", UUID.class), Source.valueOf(rs.getString("source")), rs.getString("source_code"),
                owner == null ? null : UUID.fromString(owner), rs.getString("name"), rs.getString("brand"), rs.getString("category"),
                Nutrients.from(rs), rs.getString("nutriscore"), rs.getBoolean("nutriscore_estimated"), Nutrients.num(rs, "serving_g"),
                rs.getBoolean("superseded"), rs.getTimestamp("updated_at").toInstant(), rs.getString("image_path"),
                rs.getTimestamp("source_updated_at") == null ? null : rs.getTimestamp("source_updated_at").toInstant(), info(rs), rs.getInt("uses"),
                Micros.parse(rs.getString("micros")), rs.getString("micros_from"));
    }

    public static ProductInfo info(ResultSet rs) throws SQLException {
        int nova = rs.getInt("nova");
        boolean noNova = rs.wasNull();
        int additives = rs.getInt("additives");
        boolean noAdditives = rs.wasNull();
        int scans = rs.getInt("scans");
        boolean noScans = rs.wasNull();
        return new ProductInfo(rs.getString("quantity"), rs.getString("generic_name"), rs.getString("pnns"), noNova ? null : nova,
                noAdditives ? null : additives, rs.getBoolean("sweeteners"), Nutrients.num(rs, "fruit_veg"), noScans ? null : scans);
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
                .append(" case when search_name like ? then 0 else 1 end, uses desc, length(search_name) limit ?");
        args.add(words.getFirst().replace("%", "\\%").replace("_", "\\_") + "%");
        args.add(limit);
        return jdbc.query(sql.toString(), FoodStore::map, args.toArray());
    }

    /**
     * 1.11: the foods whose name reads close to this text (trigrams of its words), the member's own, Ciqual and Open Food
     * Facts: the candidates of a food about to be created that may already exist
     */
    public List<Food> close(UUID userId, String text, int limit) {
        return jdbc.query("select " + COLUMNS + " from food where ((source = 'USER' and owner_id = ?) or (source = 'CIQUAL' and not superseded)"
                + " or source = 'OFF') and ? <% search_name order by word_similarity(?, search_name) desc, length(search_name) limit ?",
                FoodStore::map, userId, text, text, limit);
    }

    /**
     * the products of Open Food Facts (the local copy) holding every word, the candidates FoodService ranks: the most noted in
     * the app and the most scanned first (1.13), then those starting with the first word, then the shortest names
     */
    public List<Food> searchOff(List<String> words, int limit) {
        StringBuilder sql = new StringBuilder("select " + COLUMNS + " from food where source = 'OFF'");
        List<Object> args = new ArrayList<>();
        for (String w : words) {
            sql.append(" and search_name like ?");
            args.add(SearchText.contains(w));
        }
        sql.append(" order by uses desc, coalesce(scans, 0) desc, case when search_name like ? then 0 else 1 end, length(search_name) limit ?");
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
        return insert(source, code, version, ownerId, name, nameEn, brand, category, n, nutriscore, estimated, servingG, ProductInfo.NONE);
    }

    public UUID insert(Source source, String code, String version, UUID ownerId, String name, String nameEn, String brand,
            String category, Nutrients n, String nutriscore, boolean estimated, Double servingG, ProductInfo info) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into food (id, source, source_code, source_version, owner_id, name, name_en, brand, category, search_name, kcal,
                  protein_g, carbs_g, sugars_g, fat_g, sat_fat_g, fiber_g, salt_g, nutriscore, nutriscore_estimated, serving_g, quantity,
                  generic_name, pnns, nova, additives, sweeteners, fruit_veg, scans)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                id, source.name(), code, version, ownerId, name, nameEn, brand, category, searchName(name, nameEn, brand), n.kcal(),
                n.proteinG(), n.carbsG(), n.sugarsG(), n.fatG(), n.satFatG(), n.fiberG(), n.saltG(), nutriscore, estimated, servingG,
                info.quantity(), info.genericName(), info.pnns(), info.nova(), info.additives(), info.sweeteners(), info.fruitVeg(), info.scans());
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

    /** 1.13: a product's size, generic name, food group, processing, additives, share of fruit and vegetables, scans */
    public void productInfo(UUID id, ProductInfo info) {
        jdbc.update("""
                update food set quantity = ?, generic_name = ?, pnns = ?, nova = ?, additives = ?, sweeteners = ?, fruit_veg = ?, scans = ?
                where id = ?""", info.quantity(), info.genericName(), info.pnns(), info.nova(), info.additives(), info.sweeteners(),
                info.fruitVeg(), info.scans(), id);
    }

    /**
     * 1.13: how many members noted each food over the last year (the popularity the searches rank by), counted again every
     * hour; a member counts once per food however often they eat it
     */
    public int countUses() {
        int changed = jdbc.update("""
                update food f set uses = c.n from (
                  select food_id, count(distinct user_id)::int n from meal_entry
                  where food_id is not null and day > current_date - 365 group by food_id) c
                where f.id = c.food_id and f.uses <> c.n""");
        changed += jdbc.update("""
                update food set uses = 0 where uses > 0 and not exists (
                  select 1 from meal_entry e where e.food_id = food.id and e.day > current_date - 365)""");
        return changed;
    }

    /** 1.13: how often this member noted each of these foods (their own habits come first in a search) */
    public java.util.Map<UUID, Integer> usesBy(UUID userId, java.util.Collection<UUID> foodIds) {
        java.util.Map<UUID, Integer> out = new java.util.HashMap<>();
        if (foodIds.isEmpty()) {
            return out;
        }
        List<Object> args = new ArrayList<>();
        args.add(userId);
        args.addAll(foodIds);
        String marks = String.join(", ", java.util.Collections.nCopies(foodIds.size(), "?"));
        jdbc.query("select food_id, count(*)::int n from meal_entry where user_id = ? and food_id in (" + marks + ") group by food_id",
                rs -> {
                    out.put(rs.getObject("food_id", UUID.class), rs.getInt("n"));
                }, args.toArray());
        return out;
    }

    /** 1.12: what Open Food Facts says of a product besides its nutrients: its picture and when its page last changed */
    public void productPage(UUID id, String imagePath, Instant modifiedAt) {
        jdbc.update("update food set image_path = ?, source_updated_at = ? where id = ?", imagePath,
                modifiedAt == null ? null : Timestamp.from(modifiedAt), id);
    }

    public void delete(UUID id) {
        jdbc.update("delete from food where id = ?", id);
    }

    static String searchName(String name, String nameEn, String brand) {
        return SearchText.normalize(name + (brand == null ? "" : " " + brand) + (nameEn == null ? "" : " " + nameEn));
    }
}
