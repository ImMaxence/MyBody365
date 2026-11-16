package fr.mbonnici.mybody365.recipe;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.config.AppProperties;
import fr.mbonnici.mybody365.media.ImageProcessor;
import fr.mbonnici.mybody365.media.ImageProcessor.Processed;
import fr.mbonnici.mybody365.nutrition.FoodService;
import fr.mbonnici.mybody365.nutrition.FoodStore.Food;
import fr.mbonnici.mybody365.nutrition.Nutrients;
import fr.mbonnici.mybody365.nutrition.Nutriscore;
import fr.mbonnici.mybody365.storage.ObjectStorage;
import fr.mbonnici.mybody365.storage.QuotaService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Recipes: private by default, shared with the community on request (then visible to every member,
 * voted up or down, copied). Nutrients per serving are computed from the ingredients when saved.
 */
@Service
public class RecipeService {

    private static final Logger log = LoggerFactory.getLogger(RecipeService.class);
    public static final int IMAGE_SIDE = 1200;
    public static final int THUMB_SIDE = 400;

    public enum Type { BREAKFAST, LUNCH, DINNER, SNACK, DESSERT, DRINK }

    public record IngredientInput(@NotNull UUID foodId, @NotNull @DecimalMin("0.5") @DecimalMax("10000") Double grams) {}

    public record RecipeInput(
            @NotBlank @Size(max = 120) String name,
            @NotNull Type type,
            @NotNull @Min(1) @Max(50) Integer servings,
            @Size(max = 4000) String notes,
            Boolean shared,
            @NotNull @Size(max = 60) List<@Valid IngredientInput> ingredients) {}

    public record IngredientDto(UUID foodId, String name, double grams, double kcal) {}

    public record RecipeDto(UUID id, String name, Type type, int servings, String notes, boolean shared, boolean hidden, boolean mine,
            String author, Nutrients perServing, Double servingG, String nutriscore, int score, Integer myVote, String imageUrl,
            String thumbUrl, List<IngredientDto> ingredients, Instant createdAt) {}

    /** a recipe as stored */
    public record RecipeRow(UUID id, UUID ownerId, String ownerName, String name, Type type, int servings, String notes, boolean shared,
            boolean hidden, String imageFormat, Long imageBytes, int imageVersion, Nutrients perServing, Double servingG,
            String nutriscore, int score, Instant createdAt) {

        String imageKey(boolean thumb) {
            return ObjectStorage.userPrefix(ownerId) + "r/" + id + "_" + imageVersion + (thumb ? "_t." : ".") + imageFormat;
        }
    }

    private final JdbcTemplate jdbc;
    private final FoodService foods;
    private final ObjectStorage storage;
    private final ImageProcessor images;
    private final QuotaService quota;
    private final AppProperties props;

    public RecipeService(JdbcTemplate jdbc, FoodService foods, ObjectStorage storage, ImageProcessor images, QuotaService quota,
            AppProperties props) {
        this.jdbc = jdbc;
        this.foods = foods;
        this.storage = storage;
        this.images = images;
        this.quota = quota;
        this.props = props;
    }

    private static final String SELECT = """
            select r.id, r.owner_id, u.display_name, r.name, r.type, r.servings, r.notes, r.shared, r.hidden, r.image_format, r.image_bytes,
              r.image_version, r.kcal, r.protein_g, r.carbs_g, r.sugars_g, r.fat_g, r.sat_fat_g, r.fiber_g, r.salt_g, r.serving_g,
              r.nutriscore, r.score, r.created_at
            from recipe r join app_user u on u.id = r.owner_id""";

    private static RecipeRow map(ResultSet rs, int i) throws SQLException {
        long bytes = rs.getLong("image_bytes");
        boolean noImage = rs.wasNull();
        double serving = rs.getDouble("serving_g");
        boolean noServing = rs.wasNull();
        return new RecipeRow(rs.getObject("id", UUID.class), rs.getObject("owner_id", UUID.class), rs.getString("display_name"),
                rs.getString("name"), Type.valueOf(rs.getString("type")), rs.getInt("servings"), rs.getString("notes"),
                rs.getBoolean("shared"), rs.getBoolean("hidden"), rs.getString("image_format"), noImage ? null : bytes,
                rs.getInt("image_version"), Nutrients.from(rs), noServing ? null : serving, rs.getString("nutriscore"), rs.getInt("score"),
                rs.getTimestamp("created_at").toInstant());
    }

    public RecipeRow row(UUID id) {
        return jdbc.query(SELECT + " where r.id = ?", RecipeService::map, id).stream().findFirst().orElseThrow(ApiException::notFound);
    }

    /** the owner, any member when shared (and not hidden), an admin when moderating */
    public RecipeRow viewable(UUID id, UUID viewerId, boolean admin) {
        RecipeRow r = row(id);
        if (r.ownerId().equals(viewerId) || (r.shared() && !r.hidden()) || admin) {
            return r;
        }
        throw ApiException.notFound();
    }

    public RecipeDto dto(RecipeRow r, UUID viewerId, boolean withIngredients) {
        Integer myVote = jdbc.query("select value from recipe_vote where recipe_id = ? and user_id = ?", (rs, i) -> rs.getInt(1), r.id(),
                viewerId).stream().findFirst().orElse(null);
        List<IngredientDto> ingredients = withIngredients ? ingredients(r.id()) : null;
        String base = "/api/recipes/" + r.id() + "/image/";
        String v = "?v=" + r.imageVersion();
        boolean mine = r.ownerId().equals(viewerId);
        return new RecipeDto(r.id(), r.name(), r.type(), r.servings(), withIngredients ? r.notes() : null, r.shared(), r.hidden(), mine,
                firstName(r.ownerName()), r.perServing().rounded(), r.servingG(), r.nutriscore(), r.score(), myVote,
                r.imageFormat() == null ? null : base + "full" + v, r.imageFormat() == null ? null : base + "thumb" + v, ingredients,
                r.createdAt());
    }

    private List<IngredientDto> ingredients(UUID recipeId) {
        return jdbc.query("select food_id, name, grams, kcal from recipe_ingredient where recipe_id = ? order by position",
                (rs, i) -> new IngredientDto(rs.getObject("food_id", UUID.class), rs.getString("name"), rs.getDouble("grams"),
                        Math.round(rs.getDouble("kcal") * rs.getDouble("grams") / 100)),
                recipeId);
    }

    public List<RecipeDto> mine(UUID userId) {
        return jdbc.query(SELECT + " where r.owner_id = ? order by r.updated_at desc", RecipeService::map, userId).stream()
                .map(r -> dto(r, userId, false)).toList();
    }

    /** the community: shared recipes, best first or newest first, by type */
    public List<RecipeDto> community(UUID viewerId, Type type, boolean newest, int page) {
        String where = " where r.shared and not r.hidden" + (type == null ? "" : " and r.type = '" + type.name() + "'");
        String order = newest ? " order by r.shared_at desc nulls last" : " order by r.score desc, r.shared_at desc nulls last";
        return jdbc.query(SELECT + where + order + " limit 30 offset ?", RecipeService::map, Math.max(0, page) * 30).stream()
                .map(r -> dto(r, viewerId, false)).toList();
    }

    @Transactional
    public RecipeDto create(UUID userId, RecipeInput in) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into recipe (id, owner_id, name, type, servings) values (?, ?, ?, ?, ?)", id, userId, in.name().strip(),
                in.type().name(), in.servings());
        write(id, userId, in);
        return dto(row(id), userId, true);
    }

    @Transactional
    public RecipeDto update(UUID userId, UUID id, RecipeInput in) {
        own(userId, id);
        write(id, userId, in);
        return dto(row(id), userId, true);
    }

    /** ingredients (each with a copy of its food's nutrients), then the totals per serving */
    private void write(UUID id, UUID userId, RecipeInput in) {
        if (in.ingredients().isEmpty()) {
            throw ApiException.badRequest("recipe_empty");
        }
        jdbc.update("delete from recipe_ingredient where recipe_id = ?", id);
        Nutrients total = Nutrients.ZERO;
        double grams = 0;
        int position = 0;
        for (IngredientInput ing : in.ingredients()) {
            Food f = foods.usable(ing.foodId(), userId);
            Nutrients n = f.per100();
            jdbc.update("""
                    insert into recipe_ingredient (id, recipe_id, position, food_id, name, grams, kcal, protein_g, carbs_g, sugars_g, fat_g,
                      sat_fat_g, fiber_g, salt_g) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    UUID.randomUUID(), id, position++, f.id(), f.name() + (f.brand() == null ? "" : " · " + f.brand()), ing.grams(), n.kcal(),
                    n.proteinG(), n.carbsG(), n.sugarsG(), n.fatG(), n.satFatG(), n.fiberG(), n.saltG());
            total = total.plus(n.times(ing.grams() / 100));
            grams += ing.grams();
        }
        Nutrients perServing = total.times(1.0 / in.servings());
        String grade = Nutriscore.grade(total.times(100 / grams));
        boolean wasShared = Boolean.TRUE.equals(jdbc.queryForObject("select shared from recipe where id = ?", Boolean.class, id));
        jdbc.update("""
                update recipe set name = ?, type = ?, servings = ?, notes = ?, shared = ?, kcal = ?, protein_g = ?, carbs_g = ?, sugars_g = ?,
                  fat_g = ?, sat_fat_g = ?, fiber_g = ?, salt_g = ?, serving_g = ?, nutriscore = ?, updated_at = now(),
                  shared_at = case when ? and not ? then now() else shared_at end
                where id = ?""",
                in.name().strip(), in.type().name(), in.servings(), in.notes() == null || in.notes().isBlank() ? null : in.notes().strip(),
                Boolean.TRUE.equals(in.shared()), perServing.kcal(), perServing.proteinG(), perServing.carbsG(), perServing.sugarsG(), perServing.fatG(),
                perServing.satFatG(), perServing.fiberG(), perServing.saltG(), grams / in.servings(), grade, Boolean.TRUE.equals(in.shared()), wasShared, id);
    }

    @Transactional
    public void delete(UUID userId, UUID id) {
        RecipeRow r = own(userId, id);
        jdbc.update("delete from recipe where id = ?", id);
        removeImage(r);
    }

    /** a private copy in the viewer's recipes (with the picture) */
    @Transactional
    public RecipeDto copy(UUID userId, UUID id) {
        RecipeRow r = viewable(id, userId, false);
        UUID copy = UUID.randomUUID();
        jdbc.update("""
                insert into recipe (id, owner_id, name, type, servings, notes, kcal, protein_g, carbs_g, sugars_g, fat_g, sat_fat_g, fiber_g,
                  salt_g, serving_g, nutriscore)
                select ?, ?, name, type, servings, notes, kcal, protein_g, carbs_g, sugars_g, fat_g, sat_fat_g, fiber_g, salt_g, serving_g,
                  nutriscore from recipe where id = ?""", copy, userId, id);
        jdbc.update("""
                insert into recipe_ingredient (id, recipe_id, position, food_id, name, grams, kcal, protein_g, carbs_g, sugars_g, fat_g,
                  sat_fat_g, fiber_g, salt_g)
                select gen_random_uuid(), ?, position,
                  case when food_id in (select id from food where source <> 'USER' or owner_id = ?) then food_id end,
                  name, grams, kcal, protein_g, carbs_g, sugars_g, fat_g, sat_fat_g, fiber_g, salt_g
                from recipe_ingredient where recipe_id = ?""", copy, userId, id);
        if (r.imageFormat() != null) {
            byte[] full = storage.get(r.imageKey(false));
            byte[] thumb = storage.get(r.imageKey(true));
            if (full != null && thumb != null && fits(userId, full.length + thumb.length)) {
                RecipeRow c = row(copy);
                RecipeRow withImage = new RecipeRow(c.id(), c.ownerId(), c.ownerName(), c.name(), c.type(), c.servings(), c.notes(), false,
                        false, r.imageFormat(), (long) (full.length + thumb.length), 1, c.perServing(), c.servingG(), c.nutriscore(), 0,
                        c.createdAt());
                storage.put(withImage.imageKey(false), full, contentType(r.imageFormat()));
                storage.put(withImage.imageKey(true), thumb, contentType(r.imageFormat()));
                jdbc.update("update recipe set image_format = ?, image_bytes = ?, image_version = 1 where id = ?", r.imageFormat(),
                        full.length + thumb.length, copy);
            }
        }
        return dto(row(copy), userId, true);
    }

    @Transactional
    public RecipeDto setImage(UUID userId, UUID id, byte[] file) {
        RecipeRow r = own(userId, id);
        if (file == null || file.length == 0) {
            throw ApiException.badRequest("invalid_image");
        }
        if (file.length > props.storage().maxUploadMb() * 1024L * 1024L) {
            throw ApiException.badRequest("file_too_large");
        }
        Processed img = images.process(file, IMAGE_SIDE, THUMB_SIDE);
        long size = img.full().length + img.thumb().length;
        quota.check(userId, size, r.imageBytes() == null ? 0 : r.imageBytes());
        int version = r.imageVersion() + 1;
        RecipeRow next = new RecipeRow(r.id(), r.ownerId(), r.ownerName(), r.name(), r.type(), r.servings(), r.notes(), r.shared(),
                r.hidden(), img.format(), size, version, r.perServing(), r.servingG(), r.nutriscore(), r.score(), r.createdAt());
        storage.put(next.imageKey(false), img.full(), img.contentType());
        storage.put(next.imageKey(true), img.thumb(), img.contentType());
        jdbc.update("update recipe set image_format = ?, image_bytes = ?, image_version = ?, updated_at = now() where id = ?", img.format(),
                size, version, id);
        removeImage(r);
        return dto(row(id), userId, true);
    }

    @Transactional
    public RecipeDto deleteImage(UUID userId, UUID id) {
        RecipeRow r = own(userId, id);
        jdbc.update("update recipe set image_format = null, image_bytes = null where id = ?", id);
        removeImage(r);
        return dto(row(id), userId, true);
    }

    public byte[] image(RecipeRow r, boolean thumb) {
        if (r.imageFormat() == null) {
            throw ApiException.notFound();
        }
        byte[] bytes = storage.get(r.imageKey(thumb));
        if (bytes == null) {
            throw ApiException.notFound();
        }
        return bytes;
    }

    /** +1, −1, or 0 to take the vote back; never on one's own recipe */
    @Transactional
    public RecipeDto vote(UUID userId, UUID id, int value) {
        RecipeRow r = viewable(id, userId, false);
        if (r.ownerId().equals(userId)) {
            throw ApiException.badRequest("own_recipe");
        }
        if (!r.shared()) {
            throw ApiException.notFound();
        }
        if (value == 0) {
            jdbc.update("delete from recipe_vote where recipe_id = ? and user_id = ?", id, userId);
        } else {
            jdbc.update("""
                    insert into recipe_vote (recipe_id, user_id, value) values (?, ?, ?)
                    on conflict (recipe_id, user_id) do update set value = excluded.value""", id, userId, value > 0 ? 1 : -1);
        }
        jdbc.update("update recipe set score = coalesce((select sum(value) from recipe_vote where recipe_id = ?), 0) where id = ?", id, id);
        return dto(row(id), userId, true);
    }

    /** moderation: out of the community (the owner keeps it), or back */
    @Transactional
    public void setHidden(UUID id, boolean hidden) {
        row(id);
        jdbc.update("update recipe set hidden = ? where id = ?", hidden, id);
    }

    public List<RecipeDto> shared(UUID viewerId, int limit) {
        return jdbc.query(SELECT + " where r.shared order by r.shared_at desc nulls last limit ?", RecipeService::map, limit).stream()
                .map(r -> dto(r, viewerId, false)).toList();
    }

    public Map<String, Object> counts() {
        return jdbc.queryForMap("select count(*) as total, count(*) filter (where shared and not hidden) as shared,"
                + " count(*) filter (where hidden) as hidden from recipe");
    }

    private RecipeRow own(UUID userId, UUID id) {
        RecipeRow r = row(id);
        if (!r.ownerId().equals(userId)) {
            throw ApiException.notFound();
        }
        return r;
    }

    private boolean fits(UUID userId, long size) {
        try {
            quota.check(userId, size, 0);
            return true;
        } catch (ApiException e) {
            return false;
        }
    }

    private void removeImage(RecipeRow r) {
        if (r.imageFormat() == null) {
            return;
        }
        try {
            storage.delete(r.imageKey(false));
            storage.delete(r.imageKey(true));
        } catch (RuntimeException e) {
            log.warn("Could not delete the picture of recipe {}: {}", r.id(), e.getMessage());
        }
    }

    private static String contentType(String format) {
        return "webp".equals(format) ? "image/webp" : "image/jpeg";
    }

    private static String firstName(String displayName) {
        if (displayName == null) {
            return null;
        }
        String first = displayName.strip().split("\\s+")[0];
        return first.length() > 40 ? first.substring(0, 40) : first;
    }

}
