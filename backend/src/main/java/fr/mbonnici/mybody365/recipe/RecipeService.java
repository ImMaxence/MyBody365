package fr.mbonnici.mybody365.recipe;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.config.AppProperties;
import fr.mbonnici.mybody365.friends.FriendService;
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
import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Recipes: private by default, shown to the owner's friends or shared with the community on request (then
 * visible to every member, voted up or down, copied). Nutrients per serving are computed from the ingredients
 * when saved.
 */
@Service
public class RecipeService {

    private static final Logger log = LoggerFactory.getLogger(RecipeService.class);
    public static final int IMAGE_SIDE = 1200;
    public static final int THUMB_SIDE = 400;

    /** TREAT (1.9): « Plaisir », the pastries and the treats */
    public enum Type { BREAKFAST, LUNCH, DINNER, SNACK, DESSERT, TREAT, DRINK }

    /** who sees a recipe besides its owner: nobody, the friends, every member */
    public enum Visibility { PRIVATE, FRIENDS, PUBLIC }

    public record IngredientInput(@NotNull UUID foodId, @NotNull @DecimalMin("0.5") @DecimalMax("10000") Double grams) {}

    public record RecipeInput(
            @NotBlank @Size(max = 120) String name,
            @NotNull Type type,
            @NotNull @Min(1) @Max(50) Integer servings,
            @Size(max = 4000) String notes,
            Boolean shared,
            @NotNull @Size(max = 60) List<@Valid IngredientInput> ingredients,
            Visibility visibility,
            /** calories entered by the member (an imported recipe, or one written by hand) instead of computed */
            @Valid ManualNutrition manual,
            /** the ingredients as written, one per line (with manual nutrition) */
            @Size(max = 80) List<@Size(max = 300) String> ingredientLines,
            /** where the recipe comes from (the page it was imported from) */
            @Size(max = 500) String sourceUrl,
            /** every meal it is for, the main one (type) counting anyway; null: the main one only */
            @Size(max = 7) List<Type> types) {

        /** the main type first, then the others in the usual order, each once: "BREAKFAST,SNACK" */
        String allTypes() {
            java.util.LinkedHashSet<Type> all = new java.util.LinkedHashSet<>();
            all.add(type);
            if (types != null) {
                java.util.Arrays.stream(Type.values()).filter(types::contains).forEach(all::add);
            }
            return String.join(",", all.stream().map(Type::name).toList());
        }

        /** the visibility asked, or the older "shared" flag (true: the community) */
        Visibility resolved() {
            return visibility != null ? visibility : Boolean.TRUE.equals(shared) ? Visibility.PUBLIC : Visibility.PRIVATE;
        }
    }

    /** a line: its calories for the weight, its food's values per 100 g, and whether it counts as fruit and vegetables */
    public record IngredientDto(UUID foodId, String name, double grams, double kcal, Nutrients per100, boolean fruitVeg) {}

    /** per serving: the calories, the macros when known */
    public record ManualNutrition(
            @NotNull @DecimalMin("1") @DecimalMax("5000") Double kcal,
            @DecimalMin("0") @DecimalMax("500") Double proteinG,
            @DecimalMin("0") @DecimalMax("500") Double carbsG,
            @DecimalMin("0") @DecimalMax("500") Double fatG) {}

    public record RecipeDto(UUID id, String name, Type type, List<Type> types, int servings, String notes, boolean shared, Visibility visibility,
            boolean hidden, boolean mine,
            String author, Nutrients perServing, Double servingG, String nutriscore, int score, Integer myVote, String imageUrl,
            String thumbUrl, List<IngredientDto> ingredients, Instant createdAt,
            /** the calories were entered by the owner (null in lists) */
            Boolean manualNutrition, List<String> ingredientLines, String sourceUrl, String sourceName) {}

    /** a recipe as stored */
    public record RecipeRow(UUID id, UUID ownerId, String ownerName, String name, Type type, List<Type> types, int servings, String notes, boolean shared,
            Visibility visibility, boolean hidden, String imageFormat, Long imageBytes, int imageVersion, Nutrients perServing, Double servingG,
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
    private final FriendService friends;
    private final RecipeNews news;

    public RecipeService(JdbcTemplate jdbc, FoodService foods, ObjectStorage storage, ImageProcessor images, QuotaService quota,
            AppProperties props, FriendService friends, RecipeNews news) {
        this.friends = friends;
        this.news = news;
        this.jdbc = jdbc;
        this.foods = foods;
        this.storage = storage;
        this.images = images;
        this.quota = quota;
        this.props = props;
    }

    private static final String SELECT = """
            select r.id, r.owner_id, u.display_name, r.name, r.type, r.types, r.servings, r.notes, r.shared, r.visibility, r.hidden, r.image_format, r.image_bytes,
              r.image_version, r.kcal, r.protein_g, r.carbs_g, r.sugars_g, r.fat_g, r.sat_fat_g, r.fiber_g, r.salt_g, r.serving_g,
              r.nutriscore, r.score, r.created_at
            from recipe r join app_user u on u.id = r.owner_id""";

    private static RecipeRow map(ResultSet rs, int i) throws SQLException {
        long bytes = rs.getLong("image_bytes");
        boolean noImage = rs.wasNull();
        double serving = rs.getDouble("serving_g");
        boolean noServing = rs.wasNull();
        return new RecipeRow(rs.getObject("id", UUID.class), rs.getObject("owner_id", UUID.class), rs.getString("display_name"),
                rs.getString("name"), Type.valueOf(rs.getString("type")), types(rs.getString("type"), rs.getString("types")), rs.getInt("servings"),
                rs.getString("notes"),
                rs.getBoolean("shared"), Visibility.valueOf(rs.getString("visibility")), rs.getBoolean("hidden"), rs.getString("image_format"),
                noImage ? null : bytes,
                rs.getInt("image_version"), Nutrients.from(rs), noServing ? null : serving, rs.getString("nutriscore"), rs.getInt("score"),
                rs.getTimestamp("created_at").toInstant());
    }

    public RecipeRow row(UUID id) {
        return jdbc.query(SELECT + " where r.id = ?", RecipeService::map, id).stream().findFirst().orElseThrow(ApiException::notFound);
    }

    /** the owner, any member when shared, a friend when shown to friends (not hidden), an admin when moderating */
    public RecipeRow viewable(UUID id, UUID viewerId, boolean admin) {
        RecipeRow r = row(id);
        boolean friend = !r.hidden() && r.visibility() == Visibility.FRIENDS && friends.friends(r.ownerId(), viewerId);
        if (r.ownerId().equals(viewerId) || (r.shared() && !r.hidden()) || friend || admin) {
            return r;
        }
        throw ApiException.notFound();
    }

    public RecipeDto dto(RecipeRow r, UUID viewerId, boolean withIngredients) {
        Integer myVote = jdbc.query("select value from recipe_vote where recipe_id = ? and user_id = ?", (rs, i) -> rs.getInt(1), r.id(),
                viewerId).stream().findFirst().orElse(null);
        List<IngredientDto> ingredients = withIngredients ? ingredients(r.id()) : null;
        Boolean manual = null;
        List<String> lines = null;
        String source = null;
        if (withIngredients) {
            Map<String, Object> extra = jdbc.queryForMap("select manual_nutrition, ingredient_lines, source_url from recipe where id = ?", r.id());
            manual = (Boolean) extra.get("manual_nutrition");
            String text = (String) extra.get("ingredient_lines");
            lines = text == null ? List.of() : List.of(text.split("\n"));
            source = (String) extra.get("source_url");
        }
        String base = "/api/recipes/" + r.id() + "/image/";
        String v = "?v=" + r.imageVersion();
        boolean mine = r.ownerId().equals(viewerId);
        return new RecipeDto(r.id(), r.name(), r.type(), r.types(), r.servings(), withIngredients ? r.notes() : null, r.shared(), r.visibility(), r.hidden(),
                mine,
                firstName(r.ownerName()), r.perServing().rounded(), r.servingG(), r.nutriscore(), r.score(), myVote,
                r.imageFormat() == null ? null : base + "full" + v, r.imageFormat() == null ? null : base + "thumb" + v, ingredients,
                r.createdAt(), manual, lines, source, source == null ? null : sourceName(source));
    }

    private List<IngredientDto> ingredients(UUID recipeId) {
        return jdbc.query("""
                select ri.food_id, ri.name, ri.grams, ri.kcal, ri.protein_g, ri.carbs_g, ri.sugars_g, ri.fat_g, ri.sat_fat_g, ri.fiber_g, ri.salt_g,
                  f.category
                from recipe_ingredient ri left join food f on f.id = ri.food_id where ri.recipe_id = ? order by ri.position""",
                (rs, i) -> new IngredientDto(rs.getObject("food_id", UUID.class), rs.getString("name"), rs.getDouble("grams"),
                        Math.round(rs.getDouble("kcal") * rs.getDouble("grams") / 100), Nutrients.from(rs).rounded(),
                        Nutriscore.fruitVeg(rs.getString("category"))),
                recipeId);
    }

    /** "BREAKFAST,SNACK" → the types, the main one always there (and first) */
    static List<Type> types(String main, String all) {
        java.util.LinkedHashSet<Type> out = new java.util.LinkedHashSet<>();
        out.add(Type.valueOf(main));
        for (String t : all == null ? new String[0] : all.split(",")) {
            for (Type x : Type.values()) {
                if (x.name().equals(t.strip())) {
                    out.add(x);
                }
            }
        }
        return List.copyOf(out);
    }

    /** a recipe of this type: its main one, or one of the others */
    private static String ofType(Type type) {
        return type == null ? "" : " and (r.type = '" + type.name() + "' or (',' || coalesce(r.types, '') || ',') like '%," + type.name() + ",%')";
    }

    public List<RecipeDto> mine(UUID userId) {
        return jdbc.query(SELECT + " where r.owner_id = ? order by r.updated_at desc", RecipeService::map, userId).stream()
                .map(r -> dto(r, userId, false)).toList();
    }

    /** the community: shared recipes, best first or newest first, by type */
    /** a recipe name without case nor accents (as SearchText.normalize, letter for letter) */
    private static final String PLAIN_NAME = "translate(lower(r.name), 'àáâäãåèéêëìíîïòóôöõùúûüýÿçñœæ', 'aaaaaaeeeeiiiiooooouuuuyycnoa')";

    public List<RecipeDto> community(UUID viewerId, Type type, boolean newest, int page) {
        return community(viewerId, type, newest, page, null);
    }

    /** 30 a page; with words, the recipes whose name holds every one of them (« creme brulee » finds « Crème brûlée ») */
    public List<RecipeDto> community(UUID viewerId, Type type, boolean newest, int page, String query) {
        StringBuilder where = new StringBuilder(" where r.shared and not r.hidden").append(ofType(type));
        List<Object> args = new java.util.ArrayList<>();
        for (String word : fr.mbonnici.mybody365.nutrition.SearchText.words(query)) {
            where.append(" and ").append(PLAIN_NAME).append(" like ? escape '\\'");
            args.add(fr.mbonnici.mybody365.nutrition.SearchText.contains(word));
        }
        String order = newest ? " order by r.shared_at desc nulls last" : " order by r.score desc, r.shared_at desc nulls last";
        args.add(Math.max(0, page) * 30);
        return jdbc.query(SELECT + where + order + " limit 30 offset ?", RecipeService::map, args.toArray()).stream()
                .map(r -> dto(r, viewerId, false)).toList();
    }

    /** the recipes of the viewer's friends (shown to friends or to the community), newest first */
    public List<RecipeDto> ofFriends(UUID viewerId, Type type) {
        String where = " where not r.hidden and r.visibility <> 'PRIVATE'"
                + " and r.owner_id in (select user_b from friendship where user_a = ? union select user_a from friendship where user_b = ?)";
        String byType = ofType(type);
        return jdbc.query(SELECT + where + byType + " order by r.updated_at desc limit 60", RecipeService::map, viewerId, viewerId)
                .stream().map(r -> dto(r, viewerId, false)).toList();
    }

    @Transactional
    public RecipeDto create(UUID userId, RecipeInput in) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into recipe (id, owner_id, name, type, types, servings) values (?, ?, ?, ?, ?, ?)", id, userId, in.name().strip(),
                in.type().name(), in.allTypes(), in.servings());
        write(id, userId, in);
        news.saved(userId, id);
        return dto(row(id), userId, true);
    }

    @Transactional
    public RecipeDto update(UUID userId, UUID id, RecipeInput in) {
        own(userId, id);
        write(id, userId, in);
        news.saved(userId, id);
        return dto(row(id), userId, true);
    }

    /** "https://www.les-creations-de-yona.fr/…" → "les-creations-de-yona.fr" */
    static String sourceName(String url) {
        try {
            String host = URI.create(url).getHost();
            return host == null ? null : host.toLowerCase(Locale.ROOT).replaceFirst("^www\\.", "");
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String source(String url) {
        if (url == null || url.isBlank()) {
            return null;
        }
        String u = url.strip();
        if (!(u.startsWith("https://") || u.startsWith("http://")) || sourceName(u) == null) {
            throw ApiException.badRequest("validation_failed");
        }
        return u;
    }

    /** the calories entered by the member: no ingredient to compute from, the lines as written, no Nutri-Score */
    private void writeManual(UUID id, RecipeInput in) {
        jdbc.update("delete from recipe_ingredient where recipe_id = ?", id);
        List<String> lines = new ArrayList<>();
        for (String l : in.ingredientLines() == null ? List.<String>of() : in.ingredientLines()) {
            String s = l == null ? "" : l.replaceAll("\\s+", " ").strip();
            if (!s.isEmpty()) {
                lines.add(s);
            }
        }
        ManualNutrition m = in.manual();
        boolean pub = in.resolved() == Visibility.PUBLIC;
        boolean wasShared = Boolean.TRUE.equals(jdbc.queryForObject("select shared from recipe where id = ?", Boolean.class, id));
        jdbc.update("""
                update recipe set name = ?, type = ?, types = ?, servings = ?, notes = ?, shared = ?, visibility = ?, kcal = ?, protein_g = ?, carbs_g = ?,
                  sugars_g = null, fat_g = ?, sat_fat_g = null, fiber_g = null, salt_g = null, serving_g = null, nutriscore = null,
                  manual_nutrition = true, ingredient_lines = ?, source_url = ?, updated_at = now(),
                  shared_at = case when ? and not ? then now() else shared_at end
                where id = ?""",
                in.name().strip(), in.type().name(), in.allTypes(), in.servings(), in.notes() == null || in.notes().isBlank() ? null : in.notes().strip(), pub,
                in.resolved().name(), m.kcal(), m.proteinG(), m.carbsG(), m.fatG(), lines.isEmpty() ? null : String.join("\n", lines),
                source(in.sourceUrl()), pub, wasShared, id);
    }

    /** ingredients (each with a copy of its food's nutrients), then the totals per serving */
    private void write(UUID id, UUID userId, RecipeInput in) {
        if (in.manual() != null) {
            writeManual(id, in);
            return;
        }
        if (in.ingredients().isEmpty()) {
            throw ApiException.badRequest("recipe_empty");
        }
        jdbc.update("delete from recipe_ingredient where recipe_id = ?", id);
        Nutrients total = Nutrients.ZERO;
        double grams = 0;
        double fruitVeg = 0;
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
            if (Nutriscore.fruitVeg(f.category())) {
                fruitVeg += ing.grams();
            }
        }
        Nutrients perServing = total.times(1.0 / in.servings());
        // a ratatouille is mostly vegetables: their share counts, as on a packaging
        String grade = Nutriscore.grade(total.times(100 / grams), 100 * fruitVeg / grams);
        boolean wasShared = Boolean.TRUE.equals(jdbc.queryForObject("select shared from recipe where id = ?", Boolean.class, id));
        jdbc.update("""
                update recipe set name = ?, type = ?, types = ?, servings = ?, notes = ?, shared = ?, visibility = ?, kcal = ?, protein_g = ?, carbs_g = ?, sugars_g = ?,
                  fat_g = ?, sat_fat_g = ?, fiber_g = ?, salt_g = ?, serving_g = ?, nutriscore = ?, updated_at = now(),
                  shared_at = case when ? and not ? then now() else shared_at end
                where id = ?""",
                in.name().strip(), in.type().name(), in.allTypes(), in.servings(), in.notes() == null || in.notes().isBlank() ? null : in.notes().strip(),
                in.resolved() == Visibility.PUBLIC, in.resolved().name(), perServing.kcal(), perServing.proteinG(), perServing.carbsG(),
                perServing.sugarsG(), perServing.fatG(), perServing.satFatG(), perServing.fiberG(), perServing.saltG(), grams / in.servings(), grade,
                in.resolved() == Visibility.PUBLIC, wasShared, id);
        jdbc.update("update recipe set manual_nutrition = false, ingredient_lines = null, source_url = ? where id = ?", source(in.sourceUrl()), id);
    }

    /**
     * Who sees one of my recipes, changed on its own (1.9: « Partager avec mes amis » on the recipe, without opening the
     * editor). Shown to the friends for the first time, it is announced to them like a new one.
     */
    @Transactional
    public RecipeDto setVisibility(UUID userId, UUID id, Visibility visibility) {
        own(userId, id);
        boolean pub = visibility == Visibility.PUBLIC;
        jdbc.update("""
                update recipe set visibility = ?, shared = ?, updated_at = now(),
                  shared_at = case when ? and not shared then now() else shared_at end
                where id = ?""", visibility.name(), pub, pub, id);
        news.saved(userId, id);
        return dto(row(id), userId, true);
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
                insert into recipe (id, owner_id, name, type, types, servings, notes, kcal, protein_g, carbs_g, sugars_g, fat_g, sat_fat_g, fiber_g,
                  salt_g, serving_g, nutriscore, manual_nutrition, ingredient_lines, source_url)
                select ?, ?, name, type, types, servings, notes, kcal, protein_g, carbs_g, sugars_g, fat_g, sat_fat_g, fiber_g, salt_g, serving_g,
                  nutriscore, manual_nutrition, ingredient_lines, source_url from recipe where id = ?""", copy, userId, id);
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
                RecipeRow withImage = new RecipeRow(c.id(), c.ownerId(), c.ownerName(), c.name(), c.type(), c.types(), c.servings(), c.notes(), false,
                        Visibility.PRIVATE, false, r.imageFormat(), (long) (full.length + thumb.length), 1, c.perServing(), c.servingG(), c.nutriscore(), 0,
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
        RecipeRow next = new RecipeRow(r.id(), r.ownerId(), r.ownerName(), r.name(), r.type(), r.types(), r.servings(), r.notes(), r.shared(),
                r.visibility(), r.hidden(), img.format(), size, version, r.perServing(), r.servingG(), r.nutriscore(), r.score(), r.createdAt());
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
