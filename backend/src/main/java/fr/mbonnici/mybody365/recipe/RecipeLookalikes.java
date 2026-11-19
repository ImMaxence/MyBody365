package fr.mbonnici.mybody365.recipe;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.nutrition.FoodService;
import fr.mbonnici.mybody365.nutrition.FoodStore.Food;
import fr.mbonnici.mybody365.nutrition.SearchText;
import fr.mbonnici.mybody365.recipe.RecipeService.IngredientInput;
import fr.mbonnici.mybody365.recipe.RecipeService.RecipeDto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The recipes that look like the one being created (1.10), so that nobody writes again a recipe the community, a
 * friend or the member already has: the member may open it instead, or create theirs anyway.
 *
 * <p>Two recipes look alike when their ingredients and their names do. An ingredient is compared by what it is, not
 * by its exact food (« Pâtes sèches, crues » and « Pâtes sèches, aux oeufs » are both pasta), weighed by its share of
 * the recipe and by how rare it is among the recipes: flour, butter and eggs are in every cake, cherries are not.
 */
@Service
public class RecipeLookalikes {

    /** at most this many shown */
    static final int LIMIT = 3;
    /** looks alike from here (0 to 1) */
    static final double THRESHOLD = 0.5;
    /** with no word of their names in common, only (nearly) the same ingredients count: a pancake is not a waffle */
    static final double SAME_INGREDIENTS = 0.92;
    /** a recipe without ingredients (calories entered by hand) is compared by its name only */
    static final double SAME_NAME = 0.7;

    public enum Origin { MINE, FRIENDS, COMMUNITY }

    public record Query(@Size(max = 120) String name, @NotNull @Size(max = 60) List<@Valid IngredientInput> ingredients) {}

    /** a recipe that looks like it, where it comes from, and how many ingredients they share */
    public record Lookalike(RecipeDto recipe, Origin origin, int common) {}

    /** a recipe as compared: its name's words, and the share of each ingredient (by what it is) */
    record Sketch(UUID id, UUID ownerId, boolean shared, String name, Set<String> words, Map<String, Double> shares) {}

    private final JdbcTemplate jdbc;
    private final FoodService foods;
    private final RecipeService recipes;

    public RecipeLookalikes(JdbcTemplate jdbc, FoodService foods, RecipeService recipes) {
        this.jdbc = jdbc;
        this.foods = foods;
        this.recipes = recipes;
    }

    /** the recipes the member can see that look like this one, the closest first */
    public List<Lookalike> find(UUID userId, Query q) {
        Map<String, Double> grams = new LinkedHashMap<>();
        for (IngredientInput ing : q.ingredients()) {
            try {
                Food f = foods.usable(ing.foodId(), userId);
                String k = key(f.name());
                if (k != null) {
                    grams.merge(k, ing.grams(), Double::sum);
                }
            } catch (ApiException e) {
                // a food that is not the member's: left out
            }
        }
        Sketch mine = new Sketch(null, userId, false, q.name(), words(q.name()), shares(grams));
        if (mine.words().isEmpty() && mine.shares().isEmpty()) {
            return List.of();
        }
        List<Sketch> all = candidates(userId);
        Idf idf = new Idf(all, mine);
        // the very same name first (« Salade de l’équipe 2 » before « Salade de l’équipe 1 »), then the closest
        String plain = SearchText.normalize(q.name());
        record Scored(Sketch s, double score, boolean sameName) {}
        List<Scored> close = new ArrayList<>();
        for (Sketch s : all) {
            double score = score(mine, s, idf);
            if (score > 0) {
                close.add(new Scored(s, score, !plain.isEmpty() && plain.equals(SearchText.normalize(s.name()))));
            }
        }
        close.sort(Comparator.comparing(Scored::sameName).thenComparingDouble(Scored::score).reversed());
        List<Lookalike> out = new ArrayList<>();
        Set<String> names = new HashSet<>();
        for (Scored c : close) {
            if (out.size() == LIMIT) {
                break;
            }
            RecipeDto dto = recipes.dto(recipes.row(c.s().id()), userId, false);
            // a copy of a community recipe in the member’s recipes: one of the two is enough
            if (!names.add(SearchText.normalize(dto.name()))) {
                continue;
            }
            Origin origin = c.s().ownerId().equals(userId) ? Origin.MINE : c.s().shared() ? Origin.COMMUNITY : Origin.FRIENDS;
            int common = (int) mine.shares().keySet().stream().filter(c.s().shares()::containsKey).count();
            out.add(new Lookalike(dto, origin, common));
        }
        return out;
    }

    /** the member's recipes, their friends' (not private) and the community's, with their ingredients */
    private List<Sketch> candidates(UUID userId) {
        record Head(UUID ownerId, String name, boolean shared) {}
        Map<UUID, Head> heads = new LinkedHashMap<>();
        Map<UUID, Map<String, Double>> grams = new HashMap<>();
        jdbc.query("""
                select r.id, r.owner_id, r.name, r.shared, ri.name as food, ri.grams
                from recipe r left join recipe_ingredient ri on ri.recipe_id = r.id
                where r.owner_id = ?
                   or (not r.hidden and (r.shared or (r.visibility <> 'PRIVATE' and r.owner_id in
                       (select user_b from friendship where user_a = ? union select user_a from friendship where user_b = ?))))""",
                rs -> {
                    UUID id = rs.getObject("id", UUID.class);
                    if (!heads.containsKey(id)) {
                        heads.put(id, new Head(rs.getObject("owner_id", UUID.class), rs.getString("name"), rs.getBoolean("shared")));
                    }
                    String food = rs.getString("food");
                    String k = food == null ? null : key(food);
                    if (k != null) {
                        grams.computeIfAbsent(id, x -> new LinkedHashMap<>()).merge(k, rs.getDouble("grams"), Double::sum);
                    }
                }, userId, userId, userId);
        List<Sketch> out = new ArrayList<>(heads.size());
        heads.forEach((id, h) -> out.add(new Sketch(id, h.ownerId(), h.shared(), h.name(), words(h.name()), shares(grams.getOrDefault(id, Map.of())))));
        return out;
    }

    // ── the comparison, on its own for the tests ────────────────────────────────

    private static final Set<String> STOP = Set.of("de", "d", "du", "des", "la", "le", "les", "l", "a", "au", "aux", "en", "et", "ou", "sans",
            "avec", "pour", "type", "sur", "par", "un", "une", "mg");
    /** words a name does not tell a dish by: « ma », « maison », « recette » */
    private static final Set<String> NAME_STOP = Set.of("mon", "ma", "mes", "ton", "ta", "tes", "maison", "recette", "facon", "version", "light",
            "leger", "legere", "healthy", "simple", "rapide", "express");
    /** a first word that says too little: the next one tells which (« pomme de terre », « lait de coco », « sauce tomate ») */
    private static final Set<String> GENERIC = Set.of("sauce", "jus", "pate", "lait", "creme", "fromage", "haricot", "pomme", "sirop", "poudre",
            "boisson", "the", "cafe", "viande", "fruit", "petit", "noi", "eau", "feuille", "graine", "chou", "poi", "confit", "fond", "pain");

    /** « Pâtes sèches, standard, crues » → « pate-seche », « Pomme de terre, crue » → « pomme-terre », « Oeuf cru » → « oeuf » */
    static String key(String foodName) {
        String head = foodName.split(" · ")[0].split(",")[0];
        List<String> w = Arrays.stream(SearchText.normalize(head).split(" "))
                .filter(x -> !x.isEmpty() && !STOP.contains(x) && !x.chars().allMatch(Character::isDigit))
                .map(RecipeLookalikes::singular).toList();
        if (w.isEmpty()) {
            return null;
        }
        return GENERIC.contains(w.getFirst()) && w.size() > 1 ? w.getFirst() + "-" + w.get(1) : w.getFirst();
    }

    /** the words of a name that tell the dish: « Pâtes à la carbonara » → pate, carbonara */
    static Set<String> words(String name) {
        Set<String> out = new HashSet<>();
        for (String x : SearchText.normalize(name).split(" ")) {
            if (x.length() >= 3 && !STOP.contains(x) && !NAME_STOP.contains(x) && !x.chars().allMatch(Character::isDigit)) {
                out.add(singular(x));
            }
        }
        return out;
    }

    private static String singular(String w) {
        return w.length() > 3 && (w.endsWith("s") || w.endsWith("x")) ? w.substring(0, w.length() - 1) : w;
    }

    /** each ingredient's share of the recipe's weight */
    static Map<String, Double> shares(Map<String, Double> grams) {
        double total = grams.values().stream().mapToDouble(Double::doubleValue).sum();
        if (total <= 0) {
            return Map.of();
        }
        Map<String, Double> out = new HashMap<>();
        grams.forEach((k, g) -> out.put(k, g / total));
        return out;
    }

    /** how rare an ingredient or a word is among the recipes compared (the rarer, the more it tells) */
    record Idf(int n, Map<String, Integer> ingredients, Map<String, Integer> words) {

        Idf(List<Sketch> all, Sketch extra) {
            this(all.size() + 1, new HashMap<>(), new HashMap<>());
            for (Sketch s : all) {
                s.shares().keySet().forEach(k -> ingredients.merge(k, 1, Integer::sum));
                s.words().forEach(k -> words.merge(k, 1, Integer::sum));
            }
            extra.shares().keySet().forEach(k -> ingredients.merge(k, 1, Integer::sum));
            extra.words().forEach(k -> words.merge(k, 1, Integer::sum));
        }

        /** never 0, even for what every recipe has */
        double ingredient(String k) {
            return Math.log(1 + (double) n / ingredients.getOrDefault(k, 1));
        }

        double word(String k) {
            return Math.log(1 + (double) n / words.getOrDefault(k, 1));
        }
    }

    /** 0 (nothing alike) to 1 (the same): the ingredients for 60 %, the name for 40 %; 0 under the threshold */
    static double score(Sketch a, Sketch b, Idf idf) {
        double name = names(a.words(), b.words(), idf);
        if (a.shares().isEmpty() || b.shares().isEmpty()) {
            return name >= SAME_NAME ? name : 0;
        }
        double ing = ingredients(a.shares(), b.shares(), idf);
        double score = 0.6 * ing + 0.4 * name;
        return score >= THRESHOLD && (name > 0 || ing >= SAME_INGREDIENTS) ? score : 0;
    }

    /**
     * Weighted Ruzicka similarity: each ingredient by the square root of its share (2 g of spice still counts a little,
     * half a litre of milk does not crush the rest) times its rarity
     */
    static double ingredients(Map<String, Double> a, Map<String, Double> b, Idf idf) {
        Set<String> keys = new HashSet<>(a.keySet());
        keys.addAll(b.keySet());
        double min = 0;
        double max = 0;
        for (String k : keys) {
            double w = idf.ingredient(k);
            double x = Math.sqrt(a.getOrDefault(k, 0.0)) * w;
            double y = Math.sqrt(b.getOrDefault(k, 0.0)) * w;
            min += Math.min(x, y);
            max += Math.max(x, y);
        }
        return max == 0 ? 0 : min / max;
    }

    /** the share of both names' words (by rarity) found in the other one; « carbo » finds « carbonara » */
    static double names(Set<String> a, Set<String> b, Idf idf) {
        double found = 0;
        double total = 0;
        for (String w : a) {
            total += idf.word(w);
            if (b.stream().anyMatch(x -> alike(w, x))) {
                found += idf.word(w);
            }
        }
        for (String w : b) {
            total += idf.word(w);
            if (a.stream().anyMatch(x -> alike(w, x))) {
                found += idf.word(w);
            }
        }
        return total == 0 ? 0 : found / total;
    }

    private static boolean alike(String x, String y) {
        return x.equals(y) || (x.length() >= 4 && y.length() >= 4 && (x.startsWith(y) || y.startsWith(x)));
    }
}
