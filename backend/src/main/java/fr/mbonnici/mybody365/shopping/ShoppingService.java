package fr.mbonnici.mybody365.shopping;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.nutrition.SearchText;
import fr.mbonnici.mybody365.recipe.RecipeService;
import fr.mbonnici.mybody365.recipe.RecipeService.RecipeRow;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The shopping list (1.11): the ingredients of the recipes one wants to cook, for as many servings as wanted, the same
 * food added up across recipes, sorted by supermarket aisle; plus the lines one types (« papier toilette »). Ticked
 * as they go in the basket. The member's own, never shared.
 */
@Service
public class ShoppingService {

    public static final int MAX_ITEMS = 300;

    /** G: grams; ML: a liquid (1 g ≈ 1 ml); PIECE: eggs, counted */
    public enum Unit { G, ML, PIECE }

    public record Item(UUID id, String name, Double grams, Unit unit, Integer pieces, Aisle aisle, boolean checked, String recipes) {}

    /** the lines by aisle, and the recipes they come from */
    public record ShoppingList(List<Item> items, List<String> recipes) {}

    private final JdbcTemplate jdbc;
    private final RecipeService recipes;

    public ShoppingService(JdbcTemplate jdbc, RecipeService recipes) {
        this.jdbc = jdbc;
        this.recipes = recipes;
    }

    public ShoppingList list(UUID userId) {
        List<Item> items = new ArrayList<>(jdbc.query("""
                select id, name, grams, unit, aisle, checked, recipes from shopping_item where user_id = ?""", (rs, i) -> {
            BigDecimal g = rs.getBigDecimal("grams");
            Unit unit = Unit.valueOf(rs.getString("unit"));
            String name = rs.getString("name");
            Aisle aisle;
            try {
                aisle = Aisle.valueOf(rs.getString("aisle"));
            } catch (IllegalArgumentException e) {
                aisle = Aisle.OTHER;
            }
            Integer pieces = unit == Unit.PIECE && g != null ? pieces(name, g.doubleValue()) : null;
            return new Item(rs.getObject("id", UUID.class), name, g == null ? null : g.doubleValue(), unit, pieces, aisle,
                    rs.getBoolean("checked"), rs.getString("recipes"));
        }, userId));
        items.sort(Comparator.comparing(Item::aisle).thenComparing(it -> SearchText.normalize(it.name())));
        Set<String> from = new LinkedHashSet<>();
        for (Item it : items) {
            if (it.recipes() != null) {
                for (String r : it.recipes().split(", ")) {
                    from.add(r);
                }
            }
        }
        return new ShoppingList(items, List.copyOf(from));
    }

    /**
     * A recipe's ingredients for this many servings: the same food already on the list (not ticked yet) gets the
     * weight added; tap water is left out. A recipe written by hand brings its lines as they are.
     */
    @Transactional
    public ShoppingList addRecipe(UUID userId, UUID recipeId, int servings) {
        RecipeRow r = recipes.viewable(recipeId, userId, false);
        double factor = Math.clamp(servings, 1, 150) / (double) r.servings();
        record Line(UUID foodId, String name, double grams, String category, boolean usable) {}
        List<Line> lines = jdbc.query("""
                select ri.food_id, ri.name, ri.grams, f.category, (f.id is not null and (f.source <> 'USER' or f.owner_id = ?)) as usable
                from recipe_ingredient ri left join food f on f.id = ri.food_id
                where ri.recipe_id = ? order by ri.position""",
                (rs, i) -> new Line(rs.getObject("food_id", UUID.class), rs.getString("name"), rs.getDouble("grams"), rs.getString("category"),
                        rs.getBoolean("usable")), userId, recipeId);
        if (lines.isEmpty()) {
            String text = jdbc.queryForObject("select ingredient_lines from recipe where id = ?", String.class, recipeId);
            for (String l : text == null ? new String[0] : text.split("\n")) {
                if (!l.isBlank()) {
                    add(userId, null, l.strip(), null, null, r.name());
                }
            }
            return list(userId);
        }
        for (Line l : lines) {
            if (SearchText.normalize(l.category()).startsWith("eaux")) {
                continue;
            }
            // another member's own food (a friend's recipe): the line by its name only
            add(userId, l.usable() ? l.foodId() : null, l.name(), l.category(), Math.round(l.grams() * factor * 10) / 10.0, r.name());
        }
        return list(userId);
    }

    /** 1.20: a food of a usual meal planned: by its food (merged with the same one already there), its aisle from its category */
    @Transactional
    public void addFood(UUID userId, UUID foodId, String name, Double grams, String label) {
        if (name == null || name.isBlank()) {
            return;
        }
        List<String> category = jdbc.queryForList("select category from food where id = ?", String.class, foodId);
        // a food of one's own deleted since: by its name only
        add(userId, category.isEmpty() ? null : foodId, name.strip(), category.isEmpty() ? null : category.getFirst(), grams, label);
    }

    /** a line typed by the member */
    @Transactional
    public ShoppingList addLine(UUID userId, String name) {
        String n = name == null ? "" : name.replaceAll("\\s+", " ").strip();
        if (n.isEmpty() || n.length() > 300) {
            throw ApiException.badRequest("validation_failed");
        }
        add(userId, null, n, null, null, null);
        return list(userId);
    }

    private void add(UUID userId, UUID foodId, String name, String category, Double grams, String recipe) {
        List<Map<String, Object>> same = jdbc.queryForList("""
                select id, grams, recipes from shopping_item
                where user_id = ? and not checked and (food_id = ? or (food_id is null and ?::uuid is null and lower(name) = lower(?)))
                limit 1""", userId, foodId, foodId, name);
        if (!same.isEmpty() && grams != null) {
            Map<String, Object> s = same.getFirst();
            BigDecimal had = (BigDecimal) s.get("grams");
            jdbc.update("update shopping_item set grams = ?, recipes = ? where id = ?", (had == null ? 0 : had.doubleValue()) + grams,
                    withRecipe((String) s.get("recipes"), recipe), s.get("id"));
            return;
        }
        if (!same.isEmpty() && grams == null) {
            jdbc.update("update shopping_item set recipes = ? where id = ?", withRecipe((String) same.getFirst().get("recipes"), recipe),
                    same.getFirst().get("id"));
            return;
        }
        Integer count = jdbc.queryForObject("select count(*) from shopping_item where user_id = ?", Integer.class, userId);
        if (count != null && count >= MAX_ITEMS) {
            throw ApiException.badRequest("shopping_full");
        }
        jdbc.update("""
                insert into shopping_item (id, user_id, food_id, name, grams, unit, aisle, recipes) values (?, ?, ?, ?, ?, ?, ?, ?)""",
                UUID.randomUUID(), userId, foodId, name.length() > 300 ? name.substring(0, 300) : name, grams, unit(name, category).name(),
                Aisle.of(name, category).name(), withRecipe(null, recipe));
    }

    @Transactional
    public ShoppingList setChecked(UUID userId, UUID id, boolean checked) {
        if (jdbc.update("update shopping_item set checked = ? where id = ? and user_id = ?", checked, id, userId) == 0) {
            throw ApiException.notFound();
        }
        return list(userId);
    }

    @Transactional
    public ShoppingList delete(UUID userId, UUID id) {
        jdbc.update("delete from shopping_item where id = ? and user_id = ?", id, userId);
        return list(userId);
    }

    /** the ticked lines (what is in the basket), or everything */
    @Transactional
    public ShoppingList clear(UUID userId, boolean onlyChecked) {
        jdbc.update("delete from shopping_item where user_id = ?" + (onlyChecked ? " and checked" : ""), userId);
        return list(userId);
    }

    /** "Ratatouille" + "Chili" → "Ratatouille, Chili", each once, kept short */
    static String withRecipe(String recipes, String recipe) {
        if (recipe == null) {
            return recipes;
        }
        LinkedHashSet<String> all = new LinkedHashSet<>();
        if (recipes != null && !recipes.isBlank()) {
            all.addAll(List.of(recipes.split(", ")));
        }
        all.add(recipe.replace(", ", " "));
        String out = String.join(", ", all);
        return out.length() > 400 ? out.substring(0, 400) : out;
    }

    /** eggs are counted, liquids measured, the rest weighed */
    static Unit unit(String name, String category) {
        String n = SearchText.normalize(Aisle.ligatures(name));
        String c = SearchText.normalize(Aisle.ligatures(category));
        if (n.startsWith("oeuf") || n.startsWith("oeufs")) {
            return Unit.PIECE;
        }
        if (c.startsWith("laits") || c.startsWith("boisson") || c.startsWith("eaux") || n.startsWith("lait ") || n.startsWith("jus ")
                || n.startsWith("vin ") || n.startsWith("biere") || n.startsWith("cidre")
                || (n.startsWith("creme") && (n.contains("fluide") || n.contains("liquide")))) {
            return Unit.ML;
        }
        return Unit.G;
    }

    /** how many eggs for these grams: a yolk weighs about 20 g, a white 33 g, a whole egg 60 g */
    static int pieces(String name, double grams) {
        String n = SearchText.normalize(Aisle.ligatures(name));
        double each = n.contains("jaune") ? 20 : n.contains("blanc") ? 33 : 60;
        return Math.max(1, (int) Math.ceil(grams / each - 0.2));
    }
}
