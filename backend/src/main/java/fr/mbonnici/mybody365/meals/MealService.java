package fr.mbonnici.mybody365.meals;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.nutrition.FoodService;
import fr.mbonnici.mybody365.nutrition.FoodStore.Food;
import fr.mbonnici.mybody365.nutrition.Nutrients;
import fr.mbonnici.mybody365.recipe.RecipeService;
import fr.mbonnici.mybody365.recipe.RecipeService.RecipeRow;
import fr.mbonnici.mybody365.tracking.TrackingService;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
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
            @DecimalMin("0.25") @DecimalMax("20") Double servings,
            /** a portion with only its calories (a fast-food menu, a restaurant dish): no food, no recipe */
            @Valid QuickInput quick) {}

    /** what was eaten and its calories, the macros when known: the whole portion */
    public record QuickInput(
            @NotBlank @Size(max = 120) String name,
            @NotNull @DecimalMin("1") @DecimalMax("5000") Double kcal,
            @DecimalMin("0") @DecimalMax("500") Double proteinG,
            @DecimalMin("0") @DecimalMax("500") Double carbsG,
            @DecimalMin("0") @DecimalMax("500") Double fatG,
            /** optional, for an estimate that knows them (fast food): the portion's sugars, saturated fat, salt, fibre */
            @DecimalMin("0") @DecimalMax("500") Double sugarsG,
            @DecimalMin("0") @DecimalMax("500") Double satFatG,
            @DecimalMin("0") @DecimalMax("100") Double saltG,
            @DecimalMin("0") @DecimalMax("200") Double fiberG,
            /** an estimated Nutri-Score, a to e */
            @Pattern(regexp = "[a-e]") String nutriscore) {}

    public record MealUpdate(Slot slot, @DecimalMin("1") @DecimalMax("5000") Double grams,
            @DecimalMin("0.25") @DecimalMax("20") Double servings) {}

    public record CopyInput(@NotNull LocalDate fromDay, @NotNull LocalDate toDay, @NotNull Slot slot) {}

    public record EntryDto(UUID id, LocalDate day, Slot slot, UUID foodId, UUID recipeId, String name, String detail, Double grams,
            Double servings, Nutrients nutrients, String nutriscore, Instant createdAt) {}

    public record DayDto(LocalDate day, Integer targetKcal, Nutrients totals, List<EntryDto> entries) {}

    /** the totals of one day (days without anything logged are left out) */
    public record DayTotal(LocalDate day, double kcal, double proteinG, double carbsG, double fatG, int entries) {}

    public record DaysDto(Integer targetKcal, List<DayTotal> days) {}

    /** what was eaten most over a period: same food (or recipe, or name) grouped */
    public record FoodStat(String name, String detail, int times, double kcal) {}

    public record SlotStat(Slot slot, double kcal, int days) {}

    /** calories by Nutri-Score grade (null: unknown) */
    public record GradeStat(String grade, double kcal) {}

    /** a food and how much of a nutrient it brought over the period (grams) */
    public record Source(String name, int times, double grams) {}

    public record StatsDto(int days, LocalDate from, LocalDate to, Integer targetKcal, List<DayTotal> daily, Nutrients totals,
            List<FoodStat> topByCount, List<FoodStat> topByKcal, List<SlotStat> slots, List<GradeStat> grades,
            /** the foods that brought the most sugars, salt and saturated fat */
            List<Source> sugarSources, List<Source> saltSources, List<Source> satFatSources) {}

    /** a food, a recipe or a quick portion logged lately, with the amount used last time (the portion's nutrients for QUICK) */
    public record RecentDto(String kind, UUID id, String name, String detail, Double grams, Double servings, double kcal,
            String nutriscore, Nutrients quick) {}

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
        return new DayDto(day, target(userId), total.rounded(), entries);
    }

    private Integer target(UUID userId) {
        return tracking.hasProfile(userId) ? tracking.summary(userId).energy().targetKcal() : null;
    }

    private List<DayTotal> totals(UUID userId, LocalDate from, LocalDate to) {
        return jdbc.query("""
                select day, sum(kcal) kcal, coalesce(sum(protein_g), 0) p, coalesce(sum(carbs_g), 0) c, coalesce(sum(fat_g), 0) f,
                  count(*) n
                from meal_entry where user_id = ? and day between ? and ? group by day order by day""",
                (rs, i) -> new DayTotal(rs.getObject("day", LocalDate.class), round(rs.getDouble("kcal")), round(rs.getDouble("p")),
                        round(rs.getDouble("c")), round(rs.getDouble("f")), rs.getInt("n")),
                userId, from, to);
    }

    private static double round(double v) {
        return Math.round(v * 10) / 10.0;
    }

    /** the totals of each day of a range (the calendar of the Meals tab), at most 3 months and a half */
    public DaysDto days(UUID userId, LocalDate from, LocalDate to) {
        if (to.isBefore(from) || ChronoUnit.DAYS.between(from, to) > 106) {
            throw ApiException.badRequest("invalid_day");
        }
        return new DaysDto(target(userId), totals(userId, from, to));
    }

    /** the last 7, 30 or 90 days: calories day by day, macros, what is eaten most, by meal, by Nutri-Score */
    public StatsDto stats(UUID userId, int days) {
        if (days != 7 && days != 30 && days != 90) {
            throw ApiException.badRequest("invalid_day");
        }
        LocalDate to = TrackingService.today();
        LocalDate from = to.minusDays(days - 1L);
        List<DayTotal> daily = totals(userId, from, to);
        Nutrients sum = jdbc.queryForObject("""
                select coalesce(sum(kcal), 0) kcal, sum(protein_g) protein_g, sum(carbs_g) carbs_g, sum(sugars_g) sugars_g, sum(fat_g) fat_g,
                  sum(sat_fat_g) sat_fat_g, sum(fiber_g) fiber_g, sum(salt_g) salt_g
                from meal_entry where user_id = ? and day between ? and ?""", (rs, i) -> Nutrients.from(rs), userId, from, to);
        String foods = """
                select max(name) name, max(detail) detail, count(*) n, sum(kcal) kcal
                from meal_entry where user_id = ? and day between ? and ?
                group by coalesce(food_id::text, recipe_id::text, lower(name)) order by %s limit %d""";
        RowMapper<FoodStat> food = (rs, i) -> new FoodStat(rs.getString("name"), rs.getString("detail"),
                rs.getInt("n"), Math.round(rs.getDouble("kcal")));
        List<FoodStat> byCount = jdbc.query(foods.formatted("n desc, kcal desc", 8), food, userId, from, to);
        List<FoodStat> byKcal = jdbc.query(foods.formatted("kcal desc, n desc", 8), food, userId, from, to);
        List<SlotStat> slots = jdbc.query("""
                select slot, sum(kcal) kcal, count(distinct day) d from meal_entry where user_id = ? and day between ? and ?
                group by slot""", (rs, i) -> new SlotStat(Slot.valueOf(rs.getString("slot")), Math.round(rs.getDouble("kcal")),
                        rs.getInt("d")), userId, from, to);
        slots.sort(Comparator.comparing(SlotStat::slot));
        List<GradeStat> grades = jdbc.query("""
                select upper(nutriscore) grade, sum(kcal) kcal from meal_entry where user_id = ? and day between ? and ?
                group by upper(nutriscore) order by 1 nulls last""",
                (rs, i) -> new GradeStat(rs.getString("grade"), Math.round(rs.getDouble("kcal"))), userId, from, to);
        return new StatsDto(days, from, to, target(userId), daily, sum == null ? Nutrients.ZERO : sum.rounded(), byCount, byKcal, slots,
                grades, sources(userId, from, to, "sugars_g"), sources(userId, from, to, "salt_g"), sources(userId, from, to, "sat_fat_g"));
    }

    /** the three foods that brought the most of a nutrient (a column of ours, never a word from outside) */
    private List<Source> sources(UUID userId, LocalDate from, LocalDate to, String column) {
        if (!List.of("sugars_g", "salt_g", "sat_fat_g").contains(column)) {
            throw new IllegalArgumentException(column);
        }
        return jdbc.query("""
                select max(name) name, count(*) n, sum(%1$s) g from meal_entry
                where user_id = ? and day between ? and ? and %1$s > 0
                group by coalesce(food_id::text, recipe_id::text, lower(name)) order by g desc limit 3""".formatted(column),
                (rs, i) -> new Source(rs.getString("name"), rs.getInt("n"), Math.round(rs.getDouble("g") * 10) / 10.0), userId, from, to);
    }

    @Transactional
    public DayDto add(UUID userId, MealInput in) {
        checkDay(in.day());
        int sources = (in.foodId() != null ? 1 : 0) + (in.recipeId() != null ? 1 : 0) + (in.quick() != null ? 1 : 0);
        if (sources != 1) {
            throw ApiException.badRequest("invalid_quantity");
        }
        if (in.quick() != null) {
            QuickInput q = in.quick();
            insert(userId, in.day(), in.slot(), null, null, q.name().strip(), null, null, 1.0,
                    new Nutrients(q.kcal(), q.proteinG(), q.carbsG(), q.sugarsG(), q.fatG(), q.satFatG(), q.fiberG(), q.saltG()), q.nutriscore());
        } else if (in.foodId() != null) {
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
        List<Object[]> rows = new ArrayList<>(jdbc.query("""
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
                    rs.getString("detail"), grams, servings, Math.round(rs.getDouble("kcal")), rs.getString("nutriscore"), null),
                    rs.getTimestamp("created_at").toInstant()};
        }, userId));
        // quick portions (and lines whose food is gone): offered again by name, as one portion
        rows.addAll(jdbc.query("""
                select distinct on (lower(name)) name, servings, kcal, protein_g, carbs_g, sugars_g, fat_g, sat_fat_g, fiber_g, salt_g, created_at
                from meal_entry where user_id = ? and food_id is null and recipe_id is null
                order by lower(name), created_at desc""", (rs, i) -> {
            double s = rs.getDouble("servings");
            double factor = rs.wasNull() || s <= 0 ? 1 : 1 / s;
            Nutrients n = Nutrients.from(rs).times(factor).rounded();
            return new Object[] {new RecentDto("QUICK", null, rs.getString("name"), null, null, 1.0, Math.round(n.kcal()), null, n),
                    rs.getTimestamp("created_at").toInstant()};
        }, userId));
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
