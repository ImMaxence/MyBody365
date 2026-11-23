package fr.mbonnici.mybody365.meals;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.meals.MealService.Slot;
import fr.mbonnici.mybody365.recipe.RecipeService;
import fr.mbonnici.mybody365.shopping.ShoppingService;
import fr.mbonnici.mybody365.tracking.TrackingService;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 1.20: the meals planned for the days to come: a recipe and how many servings, a usual meal, or a note (« Restaurant avec
 * Léa »). On the day, a tap turns one into a meal line (the app adds it like any other, offline too, then takes it off the
 * plan); the recipes and the usual meals of a week go to the shopping list in one tap. From yesterday to two months ahead,
 * 300 days' worth at most. Not in the backups: a plan for the days to come.
 */
@Service
public class MealPlans {

    static final int MAX_AHEAD = 300;

    public enum Kind { RECIPE, TEMPLATE, NOTE }

    public record PlanItem(UUID id, LocalDate day, Slot slot, Kind kind, UUID recipeId, UUID templateId, String name, Double servings,
            /** what it is worth (the recipe's servings, the usual meal's lines); null for a note */
            Long kcal, String thumbUrl) {}

    private final JdbcTemplate jdbc;
    private final RecipeService recipes;
    private final MealTemplates templates;
    private final ShoppingService shopping;

    public MealPlans(JdbcTemplate jdbc, RecipeService recipes, MealTemplates templates, ShoppingService shopping) {
        this.jdbc = jdbc;
        this.recipes = recipes;
        this.templates = templates;
        this.shopping = shopping;
    }

    public List<PlanItem> list(UUID userId, LocalDate from, LocalDate to) {
        if (to.isBefore(from) || ChronoUnit.DAYS.between(from, to) > 62) {
            throw ApiException.badRequest("invalid_day");
        }
        Map<UUID, MealTemplates.TemplateDto> mine = templates.list(userId).stream()
                .collect(Collectors.toMap(MealTemplates.TemplateDto::id, Function.identity()));
        return jdbc.query("""
                select p.id, p.day, p.slot, p.recipe_id, p.template_id, p.servings, p.note, r.name as recipe_name, r.kcal as recipe_kcal,
                  r.image_format, r.image_version
                from meal_plan p left join recipe r on r.id = p.recipe_id
                where p.user_id = ? and p.day between ? and ?
                order by p.day, case p.slot when 'BREAKFAST' then 0 when 'LUNCH' then 1 when 'DINNER' then 2 else 3 end, p.created_at""",
                (rs, i) -> {
                    UUID recipe = rs.getObject("recipe_id", UUID.class);
                    UUID template = rs.getObject("template_id", UUID.class);
                    double s = rs.getDouble("servings");
                    Double servings = rs.wasNull() ? null : s;
                    LocalDate day = rs.getObject("day", LocalDate.class);
                    Slot slot = Slot.valueOf(rs.getString("slot"));
                    UUID id = rs.getObject("id", UUID.class);
                    if (recipe != null) {
                        double kcal = rs.getDouble("recipe_kcal");
                        String thumb = rs.getString("image_format") == null ? null
                                : "/api/recipes/" + recipe + "/image/thumb?v=" + rs.getInt("image_version");
                        return new PlanItem(id, day, slot, Kind.RECIPE, recipe, null, rs.getString("recipe_name"), servings,
                                Math.round(kcal * (servings == null ? 1 : servings)), thumb);
                    }
                    if (template != null) {
                        MealTemplates.TemplateDto t = mine.get(template);
                        return new PlanItem(id, day, slot, Kind.TEMPLATE, null, template, t == null ? "" : t.name(), null,
                                t == null ? null : Math.round(t.kcal()), null);
                    }
                    return new PlanItem(id, day, slot, Kind.NOTE, null, null, rs.getString("note"), null, null, null);
                }, userId, from, to);
    }

    public record PlanInput(LocalDate day, Slot slot, UUID recipeId, UUID templateId, Double servings, String note) {}

    @Transactional
    public PlanItem add(UUID userId, PlanInput in) {
        LocalDate today = TrackingService.today();
        if (in.day() == null || in.slot() == null || in.day().isBefore(today.minusDays(1)) || in.day().isAfter(today.plusDays(62))) {
            throw ApiException.badRequest("invalid_day");
        }
        String note = in.note() == null ? null : in.note().replaceAll("\\s+", " ").strip();
        int things = (in.recipeId() != null ? 1 : 0) + (in.templateId() != null ? 1 : 0) + (note != null && !note.isEmpty() ? 1 : 0);
        if (things != 1 || (note != null && note.length() > 80)) {
            throw ApiException.badRequest("validation_failed");
        }
        Double servings = null;
        if (in.recipeId() != null) {
            recipes.viewable(in.recipeId(), userId, false);
            servings = in.servings() == null ? 1 : in.servings();
            if (servings < 0.25 || servings > 20) {
                throw ApiException.badRequest("invalid_quantity");
            }
        }
        if (in.templateId() != null && templates.list(userId).stream().noneMatch(t -> t.id().equals(in.templateId()))) {
            throw ApiException.notFound();
        }
        Integer ahead = jdbc.queryForObject("select count(*) from meal_plan where user_id = ? and day >= ?", Integer.class, userId, today);
        if (ahead != null && ahead >= MAX_AHEAD) {
            throw ApiException.conflict("plan_full");
        }
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into meal_plan (id, user_id, day, slot, recipe_id, template_id, servings, note, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                id, userId, in.day(), in.slot().name(), in.recipeId(), in.templateId(), servings, in.recipeId() == null && in.templateId() == null ? note : null,
                Timestamp.from(Instant.now()));
        return list(userId, in.day(), in.day()).stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow();
    }

    @Transactional
    public void delete(UUID userId, UUID id) {
        if (jdbc.update("delete from meal_plan where id = ? and user_id = ?", id, userId) == 0) {
            throw ApiException.notFound();
        }
    }

    /** the recipes (for their servings) and the usual meals (their foods) planned from a day to another, on the shopping list */
    @Transactional
    public ShoppingService.ShoppingList toShopping(UUID userId, LocalDate from, LocalDate to) {
        List<PlanItem> items = list(userId, from, to);
        for (PlanItem p : items) {
            if (p.kind() == Kind.RECIPE) {
                shopping.addRecipe(userId, p.recipeId(), (int) Math.max(1, Math.min(50, Math.round(p.servings() == null ? 1 : p.servings()))));
            }
        }
        Map<UUID, MealTemplates.TemplateDto> mine = templates.list(userId).stream()
                .collect(Collectors.toMap(MealTemplates.TemplateDto::id, Function.identity()));
        for (PlanItem p : items) {
            MealTemplates.TemplateDto t = p.kind() == Kind.TEMPLATE ? mine.get(p.templateId()) : null;
            if (t == null) {
                continue;
            }
            for (MealTemplates.Item line : t.items()) {
                if (line.recipeId() != null) {
                    shopping.addRecipe(userId, line.recipeId(),
                            (int) Math.max(1, Math.min(50, Math.round(line.servings() == null ? 1 : line.servings()))));
                } else if (line.foodId() != null) {
                    shopping.addFood(userId, line.foodId(), line.name(), line.grams(), t.name());
                }
            }
        }
        return shopping.list(userId);
    }
}
