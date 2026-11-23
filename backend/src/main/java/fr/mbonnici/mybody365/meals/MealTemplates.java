package fr.mbonnici.mybody365.meals;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.meals.MealService.DayDto;
import fr.mbonnici.mybody365.meals.MealService.EntryDto;
import fr.mbonnici.mybody365.meals.MealService.Slot;
import fr.mbonnici.mybody365.nutrition.Nutrients;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * 1.19: « Mes repas habituels »: a meal one has often (the breakfast of every day, the Monday lunch), kept from a meal of a
 * day with its lines as they were noted (their food or recipe, their amount, what they were worth), and added again in one
 * tap. The app adds its lines one by one through the usual add (so it also works without network: each line waits on the
 * phone like any other). At most MAX a member, the latest used first.
 */
@Service
public class MealTemplates {

    public record Item(UUID foodId, UUID recipeId, String name, String detail, Double grams, Double servings, Nutrients nutrients,
            Double health, boolean liquid, String thumbUrl, String group) {}

    public record TemplateDto(UUID id, String name, Slot slot, List<Item> items, double kcal, Instant createdAt) {}

    public record TemplateInput(@NotBlank @Size(max = 80) String name, @NotNull LocalDate day, @NotNull Slot slot) {}

    static final int MAX = 30;

    private static final TypeReference<List<Item>> ITEMS = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final MealService meals;
    private final JsonMapper json;

    public MealTemplates(JdbcTemplate jdbc, MealService meals, JsonMapper json) {
        this.jdbc = jdbc;
        this.meals = meals;
        this.json = json;
    }

    public List<TemplateDto> list(UUID userId) {
        return jdbc.query("""
                select id, name, slot, items::text as items, created_at from meal_template where user_id = ?
                order by coalesce(used_at, created_at) desc""", (rs, i) -> {
            List<Item> items = json.readValue(rs.getString("items"), ITEMS);
            String slot = rs.getString("slot");
            return new TemplateDto(rs.getObject("id", UUID.class), rs.getString("name"), slot == null ? null : Slot.valueOf(slot), items,
                    Math.round(items.stream().mapToDouble(x -> x.nutrients() == null ? 0 : x.nutrients().kcal()).sum()),
                    rs.getTimestamp("created_at").toInstant());
        }, userId);
    }

    /** the lines of a meal of a day, as they were noted, kept under a name (the same name again replaces it) */
    @Transactional
    public TemplateDto save(UUID userId, TemplateInput in) {
        DayDto day = meals.day(userId, in.day());
        List<Item> items = day.entries().stream().filter(e -> e.slot() == in.slot()).map(MealTemplates::item).toList();
        if (items.isEmpty()) {
            throw ApiException.badRequest("template_empty");
        }
        String name = in.name().strip();
        jdbc.update("delete from meal_template where user_id = ? and lower(name) = lower(?)", userId, name);
        Integer count = jdbc.queryForObject("select count(*) from meal_template where user_id = ?", Integer.class, userId);
        if (count != null && count >= MAX) {
            throw ApiException.badRequest("templates_full");
        }
        UUID id = UUID.randomUUID();
        jdbc.update("insert into meal_template (id, user_id, name, slot, items, created_at) values (?, ?, ?, ?, ?::jsonb, ?)", id, userId, name,
                in.slot().name(), json.writeValueAsString(items), Timestamp.from(Instant.now()));
        return list(userId).stream().filter(t -> t.id().equals(id)).findFirst().orElseThrow();
    }

    /** added again: it comes first next time */
    public void used(UUID userId, UUID id) {
        jdbc.update("update meal_template set used_at = now() where id = ? and user_id = ?", id, userId);
    }

    public void delete(UUID userId, UUID id) {
        if (jdbc.update("delete from meal_template where id = ? and user_id = ?", id, userId) == 0) {
            throw ApiException.notFound();
        }
    }

    private static Item item(EntryDto e) {
        return new Item(e.foodId(), e.recipeId(), e.name(), e.detail(), e.grams(), e.servings(), e.nutrients(), e.health(), e.liquid(),
                e.thumbUrl(), e.group());
    }
}
