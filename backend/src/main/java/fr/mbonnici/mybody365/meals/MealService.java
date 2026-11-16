package fr.mbonnici.mybody365.meals;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.nutrition.FoodService;
import fr.mbonnici.mybody365.nutrition.FoodStore.Food;
import fr.mbonnici.mybody365.nutrition.Nutrients;
import fr.mbonnici.mybody365.recipe.RecipeService;
import fr.mbonnici.mybody365.recipe.RecipeService.RecipeRow;
import fr.mbonnici.mybody365.tracking.TrackingService;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** What was eaten, day by day: each line keeps the nutrients it was logged with. */
@Service
public class MealService {

    public enum Slot { BREAKFAST, LUNCH, DINNER, SNACK }

    public record MealInput(
            @NotNull LocalDate day,
            @NotNull Slot slot,
            UUID foodId,
            UUID recipeId,
            @DecimalMin("1") @DecimalMax("5000") Double grams,
            @DecimalMin("0.25") @DecimalMax("20") Double servings) {}

    public record MealUpdate(Slot slot, @DecimalMin("1") @DecimalMax("5000") Double grams,
            @DecimalMin("0.25") @DecimalMax("20") Double servings) {}

    public record CopyInput(@NotNull LocalDate fromDay, @NotNull LocalDate toDay, @NotNull Slot slot) {}

    public record EntryDto(UUID id, LocalDate day, Slot slot, UUID foodId, UUID recipeId, String name, String detail, Double grams,
            Double servings, Nutrients nutrients, String nutriscore, Instant createdAt) {}

    public record DayDto(LocalDate day, Integer targetKcal, Nutrients totals, List<EntryDto> entries) {}

    /** a food or recipe logged lately, with the amount used last time */
    public record RecentDto(String kind, UUID id, String name, String detail, Double grams, Double servings, double kcal,
            String nutriscore) {}

    private final JdbcTemplate jdbc;
    private final FoodService foods;
    private final RecipeService recipes;
    private final TrackingService tracking;

    public MealService(JdbcTemplate jdbc, FoodService foods, RecipeService recipes, TrackingService tracking) {
        this.jdbc = jdbc;
        this.foods = foods;
        this.recipes = recipes;
        this.tracking = tracking;
    }

    private static final String COLUMNS = """
            id, day, slot, food_id, recipe_id, name, detail, grams, servings, kcal, protein_g, carbs_g, fat_g, sugars_g, fiber_g,
            sat_fat_g, salt_g, nutriscore, created_at""";

    private static EntryDto map(ResultSet rs, int i) throws SQLException {
        double grams = rs.getDouble("grams");
        boolean noGrams = rs.wasNull();
        double servings = rs.getDouble("servings");
        boolean noServings = rs.wasNull();
        return new EntryDto(rs.getObject("id", UUID.class), rs.getObject("day", LocalDate.class), Slot.valueOf(rs.getString("slot")),
                rs.getObject("food_id", UUID.class), rs.getObject("recipe_id", UUID.class), rs.getString("name"), rs.getString("detail"),
                noGrams ? null : grams, noServings ? null : servings, Nutrients.from(rs).rounded(), rs.getString("nutriscore"),
                rs.getTimestamp("created_at").toInstant());
    }

    public DayDto day(UUID userId, LocalDate day) {
        List<EntryDto> entries = jdbc.query("select " + COLUMNS + " from meal_entry where user_id = ? and day = ? order by created_at",
                MealService::map, userId, day);
        Nutrients total = Nutrients.ZERO;
        for (EntryDto e : entries) {
            total = total.plus(e.nutrients());
        }
        Integer target = null;
        if (tracking.hasProfile(userId)) {
            target = tracking.summary(userId).energy().targetKcal();
        }
        return new DayDto(day, target, total.rounded(), entries);
    }

    @Transactional
    public DayDto add(UUID userId, MealInput in) {
        checkDay(in.day());
        if ((in.foodId() == null) == (in.recipeId() == null)) {
            throw ApiException.badRequest("invalid_quantity");
        }
        if (in.foodId() != null) {
            Food f = foods.usable(in.foodId(), userId);
            double grams = in.grams() != null ? in.grams() : f.servingG() != null ? f.servingG() : 100;
            insert(userId, in.day(), in.slot(), f.id(), null, f.name(), f.brand(), grams, null, f.per100().times(grams / 100), f.nutriscore());
        } else {
            RecipeRow r = recipes.viewable(in.recipeId(), userId, false);
            double servings = in.servings() != null ? in.servings() : 1;
            insert(userId, in.day(), in.slot(), null, r.id(), r.name(), null, null, servings, r.perServing().times(servings), r.nutriscore());
        }
        return day(userId, in.day());
    }

    /** a new amount scales the nutrients the line was logged with (the food may be gone since) */
    @Transactional
    public DayDto update(UUID userId, UUID id, MealUpdate in) {
        EntryDto e = own(userId, id);
        double factor = 1;
        Double grams = e.grams();
        Double servings = e.servings();
        if (in.grams() != null && e.grams() != null) {
            factor = in.grams() / e.grams();
            grams = in.grams();
        } else if (in.servings() != null && e.servings() != null) {
            factor = in.servings() / e.servings();
            servings = in.servings();
        }
        Nutrients n = e.nutrients().times(factor);
        jdbc.update("""
                update meal_entry set slot = ?, grams = ?, servings = ?, kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?, sugars_g = ?,
                  fiber_g = ?, sat_fat_g = ?, salt_g = ? where id = ? and user_id = ?""",
                (in.slot() == null ? e.slot() : in.slot()).name(), grams, servings, n.kcal(), n.proteinG(), n.carbsG(), n.fatG(), n.sugarsG(),
                n.fiberG(), n.satFatG(), n.saltG(), id, userId);
        return day(userId, e.day());
    }

    @Transactional
    public DayDto delete(UUID userId, UUID id) {
        EntryDto e = own(userId, id);
        jdbc.update("delete from meal_entry where id = ? and user_id = ?", id, userId);
        return day(userId, e.day());
    }

    /** the same meal as another day (yesterday's breakfast…) */
    @Transactional
    public DayDto copy(UUID userId, CopyInput in) {
        checkDay(in.toDay());
        List<EntryDto> from = jdbc.query("select " + COLUMNS + " from meal_entry where user_id = ? and day = ? and slot = ? order by created_at",
                MealService::map, userId, in.fromDay(), in.slot().name());
        for (EntryDto e : from) {
            insert(userId, in.toDay(), in.slot(), e.foodId(), e.recipeId(), e.name(), e.detail(), e.grams(), e.servings(), e.nutrients(),
                    e.nutriscore());
        }
        return day(userId, in.toDay());
    }

    public List<RecentDto> recent(UUID userId) {
        List<RecentDto> out = new ArrayList<>();
        List<Object[]> rows = jdbc.query("""
                select distinct on (coalesce(food_id, recipe_id)) food_id, recipe_id, name, detail, grams, servings, kcal, nutriscore, created_at
                from meal_entry where user_id = ? and (food_id is not null or recipe_id is not null)
                order by coalesce(food_id, recipe_id), created_at desc""", (rs, i) -> {
            double g = rs.getDouble("grams");
            Double grams = rs.wasNull() ? null : g;
            double s = rs.getDouble("servings");
            Double servings = rs.wasNull() ? null : s;
            UUID food = rs.getObject("food_id", UUID.class);
            UUID recipe = rs.getObject("recipe_id", UUID.class);
            return new Object[] {new RecentDto(food != null ? "FOOD" : "RECIPE", food != null ? food : recipe, rs.getString("name"),
                    rs.getString("detail"), grams, servings, Math.round(rs.getDouble("kcal")), rs.getString("nutriscore")),
                    rs.getTimestamp("created_at").toInstant()};
        }, userId);
        rows.sort(Comparator.comparing((Object[] r) -> (Instant) r[1]).reversed());
        for (Object[] r : rows.subList(0, Math.min(15, rows.size()))) {
            out.add((RecentDto) r[0]);
        }
        return out;
    }

    private void insert(UUID userId, LocalDate day, Slot slot, UUID foodId, UUID recipeId, String name, String detail, Double grams,
            Double servings, Nutrients n, String nutriscore) {
        jdbc.update("""
                insert into meal_entry (id, user_id, day, slot, food_id, recipe_id, name, detail, grams, servings, kcal, protein_g, carbs_g,
                  fat_g, sugars_g, fiber_g, sat_fat_g, salt_g, nutriscore, created_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                UUID.randomUUID(), userId, day, slot.name(), foodId, recipeId, name, detail, grams, servings, n.kcal(), n.proteinG(),
                n.carbsG(), n.fatG(), n.sugarsG(), n.fiberG(), n.satFatG(), n.saltG(), nutriscore, Timestamp.from(Instant.now()));
    }

    private EntryDto own(UUID userId, UUID id) {
        return jdbc.query("select " + COLUMNS + " from meal_entry where id = ? and user_id = ?", MealService::map, id, userId).stream()
                .findFirst().orElseThrow(ApiException::notFound);
    }

    private static void checkDay(LocalDate day) {
        LocalDate today = TrackingService.today();
        if (day.isAfter(today.plusDays(1)) || day.isBefore(today.minusYears(2))) {
            throw ApiException.badRequest("invalid_day");
        }
    }
}
