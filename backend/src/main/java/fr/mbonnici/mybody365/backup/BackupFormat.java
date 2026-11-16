package fr.mbonnici.mybody365.backup;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What a backup holds, table by table, with the type of each column. Exports write exactly these
 * columns; restores read only these (whatever else a file may contain is ignored) and bind every value
 * as a typed parameter.
 */
final class BackupFormat {

    static final String FORMAT = "mybody365-backup";
    static final int VERSION = 1;

    enum Type { DATE, TIME, TIMESTAMP, NUM, INT, BOOL, TEXT, UUID }

    record Table(String name, Map<String, Type> columns) {
        List<String> names() {
            return List.copyOf(columns.keySet());
        }
    }

    private static Map<String, Type> cols(Object... pairs) {
        Map<String, Type> m = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            m.put((String) pairs[i], (Type) pairs[i + 1]);
        }
        return m;
    }

    static final Table PROFILE = new Table("body_profile", cols("sex", Type.TEXT, "birth_date", Type.DATE, "height_cm", Type.NUM,
            "activity_level", Type.TEXT, "start_weight_kg", Type.NUM, "start_date", Type.DATE, "goal_weight_kg", Type.NUM,
            "weekly_rate_kg", Type.NUM));

    static final Table WATER = new Table("water_log", cols("day", Type.DATE, "glasses", Type.INT));

    static final Table LOGS = new Table("body_log", cols("day", Type.DATE, "weight_kg", Type.NUM, "body_fat_pct", Type.NUM, "waist_cm",
            Type.NUM, "hips_cm", Type.NUM, "chest_cm", Type.NUM, "arm_cm", Type.NUM, "thigh_cm", Type.NUM, "note", Type.TEXT));

    static final Table FOODS = new Table("food", cols("id", Type.UUID, "name", Type.TEXT, "brand", Type.TEXT, "kcal", Type.NUM,
            "protein_g", Type.NUM, "carbs_g", Type.NUM, "sugars_g", Type.NUM, "fat_g", Type.NUM, "sat_fat_g", Type.NUM, "fiber_g", Type.NUM,
            "salt_g", Type.NUM, "nutriscore", Type.TEXT, "nutriscore_estimated", Type.BOOL, "serving_g", Type.NUM));

    static final Table RECIPES = new Table("recipe", cols("id", Type.UUID, "name", Type.TEXT, "type", Type.TEXT, "servings", Type.INT,
            "notes", Type.TEXT, "shared", Type.BOOL, "visibility", Type.TEXT, "manual_nutrition", Type.BOOL, "ingredient_lines", Type.TEXT,
            "source_url", Type.TEXT, "kcal", Type.NUM, "protein_g", Type.NUM, "carbs_g", Type.NUM, "fat_g", Type.NUM,
            "sugars_g", Type.NUM, "fiber_g", Type.NUM, "sat_fat_g", Type.NUM, "salt_g", Type.NUM, "serving_g", Type.NUM, "nutriscore",
            Type.TEXT, "image_format", Type.TEXT));

    static final Table INGREDIENTS = new Table("recipe_ingredient", cols("recipe_id", Type.UUID, "position", Type.INT, "food_id",
            Type.UUID, "name", Type.TEXT, "grams", Type.NUM, "kcal", Type.NUM, "protein_g", Type.NUM, "carbs_g", Type.NUM, "sugars_g",
            Type.NUM, "fat_g", Type.NUM, "sat_fat_g", Type.NUM, "fiber_g", Type.NUM, "salt_g", Type.NUM));

    static final Table MEALS = new Table("meal_entry", cols("day", Type.DATE, "slot", Type.TEXT, "food_id", Type.UUID, "recipe_id",
            Type.UUID, "name", Type.TEXT, "detail", Type.TEXT, "grams", Type.NUM, "servings", Type.NUM, "kcal", Type.NUM, "protein_g",
            Type.NUM, "carbs_g", Type.NUM, "fat_g", Type.NUM, "sugars_g", Type.NUM, "fiber_g", Type.NUM, "sat_fat_g", Type.NUM, "salt_g",
            Type.NUM, "nutriscore", Type.TEXT, "created_at", Type.TIMESTAMP));

    static final Table PHOTOS = new Table("photo", cols("id", Type.UUID, "day", Type.DATE, "pose", Type.TEXT, "width", Type.INT,
            "height", Type.INT, "format", Type.TEXT));

    static final Table WORKOUTS = new Table("workout_session", cols("id", Type.UUID, "day", Type.DATE, "program", Type.TEXT, "workout",
            Type.TEXT, "duration_min", Type.INT, "exercises", Type.TEXT, "note", Type.TEXT, "created_at", Type.TIMESTAMP));

    static final Table PREFS = new Table("notification_pref", cols("daily_enabled", Type.BOOL, "daily_time", Type.TIME, "gym_enabled",
            Type.BOOL, "gym_days", Type.TEXT, "gym_time", Type.TIME, "friends_enabled", Type.BOOL));

    private BackupFormat() {}

    /** a database value as JSON writes it */
    static Object toJson(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Date d) {
            return d.toLocalDate().toString();
        }
        if (v instanceof Time t) {
            return t.toLocalTime().toString();
        }
        if (v instanceof Timestamp ts) {
            return ts.toInstant().toString();
        }
        if (v instanceof BigDecimal b) {
            return b.doubleValue();
        }
        if (v instanceof UUID u) {
            return u.toString();
        }
        return v;
    }

    /** a JSON value as the column expects it (anything unreadable becomes null, never an exception) */
    static Object fromJson(Object v, Type type) {
        if (v == null) {
            return null;
        }
        try {
            return switch (type) {
                case DATE -> LocalDate.parse(v.toString());
                case TIME -> LocalTime.parse(v.toString());
                case TIMESTAMP -> Timestamp.from(Instant.parse(v.toString()));
                case NUM -> v instanceof Number n ? n.doubleValue() : Double.parseDouble(v.toString());
                case INT -> v instanceof Number n ? n.intValue() : Integer.parseInt(v.toString());
                case BOOL -> v instanceof Boolean b ? b : Boolean.parseBoolean(v.toString());
                case TEXT -> {
                    String s = v.toString();
                    yield s.length() > 8000 ? s.substring(0, 8000) : s;
                }
                case UUID -> java.util.UUID.fromString(v.toString());
            };
        } catch (RuntimeException e) {
            return null;
        }
    }
}
