package fr.mbonnici.mybody365.recipe;

import fr.mbonnici.mybody365.nutrition.SearchText;
import fr.mbonnici.mybody365.recipe.RecipeService.RecipeDto;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * « Que faire avec ce que j'ai ? » (1.11): the recipes the member can see that use the ingredients they have, those
 * with all of them first, then those that need the fewest other things (salt, oil, flour and spices are in every
 * kitchen and never count as missing). An ingredient is what it is (RecipeLookalikes.key): « Pâtes » finds every pasta.
 */
@Service
public class RecipeFinder {

    static final int LIMIT = 40;
    static final int MAX_CHOSEN = 6;

    /** in every kitchen: never « missing » */
    static final Set<String> PANTRY = Set.of("sel", "poivre", "huile", "vinaigre", "sucre", "farine", "levure", "bouillon", "amidon", "herbe",
            "cumin", "paprika", "curry", "cannelle", "noi-muscade", "curcuma", "laurier", "thym", "origan", "vanille", "clou", "cardamome",
            "piment", "sucre-vanille", "gelatine");

    /** an ingredient one can choose: its key, how it reads, in how many recipes */
    public record Family(String key, String label, int recipes) {}

    /** a recipe that uses some of them: how many, and what else it needs */
    public record Found(RecipeDto recipe, int have, int missing, List<String> missingLabels) {}

    private final JdbcTemplate jdbc;
    private final RecipeService recipes;

    public RecipeFinder(JdbcTemplate jdbc, RecipeService recipes) {
        this.jdbc = jdbc;
        this.recipes = recipes;
    }

    /** a recipe as the finder sees it: the keys of its ingredients */
    record Entry(UUID id, String name, Set<String> keys) {}

    private record Loaded(List<Entry> entries, Map<String, String> labels, Map<String, Integer> counts) {}

    /** every ingredient of the recipes the member can see, the most used first (the kitchen basics left out) */
    public List<Family> families(UUID userId) {
        Loaded l = load(userId);
        List<Family> out = new ArrayList<>();
        l.counts().forEach((k, n) -> {
            if (!PANTRY.contains(k) && !k.startsWith("eau")) {
                out.add(new Family(k, l.labels().get(k), n));
            }
        });
        out.sort(Comparator.comparingInt(Family::recipes).reversed().thenComparing(Family::label));
        return out;
    }

    public List<Found> find(UUID userId, List<String> chosenKeys) {
        Set<String> chosen = new LinkedHashSet<>(chosenKeys.stream().filter(k -> k != null && !k.isBlank()).limit(MAX_CHOSEN).toList());
        if (chosen.isEmpty()) {
            return List.of();
        }
        Loaded l = load(userId);
        record Scored(Entry e, int have, List<String> missing) {}
        List<Scored> scored = new ArrayList<>();
        for (Entry e : l.entries()) {
            int have = (int) chosen.stream().filter(e.keys()::contains).count();
            if (have == 0) {
                continue;
            }
            List<String> missing = e.keys().stream().filter(k -> !chosen.contains(k) && !PANTRY.contains(k) && !k.startsWith("eau")).toList();
            scored.add(new Scored(e, have, missing));
        }
        scored.sort(Comparator.comparingInt((Scored s) -> -s.have()).thenComparingInt(s -> s.missing().size())
                .thenComparing(s -> SearchText.normalize(s.e().name())));
        List<Found> out = new ArrayList<>();
        Set<String> names = new java.util.HashSet<>();
        for (Scored s : scored) {
            if (out.size() == LIMIT) {
                break;
            }
            // a copy of a community recipe in the member's: once is enough
            if (!names.add(SearchText.normalize(s.e().name()))) {
                continue;
            }
            List<String> labels = s.missing().stream().limit(4).map(k -> l.labels().getOrDefault(k, k)).toList();
            out.add(new Found(recipes.dto(recipes.row(s.e().id()), userId, false), s.have(), s.missing().size(), labels));
        }
        return out;
    }

    /** 1.21: a fruit or a vegetable of the month: its id, its kind, its word for « avec ce que j'ai », its recipes, its vitamins per 100 g */
    public record Produce(String id, String kind, String key, int recipes, Map<String, Double> micros) {}

    /** a recipe of the season: the fruits and vegetables of the month it uses */
    public record SeasonRecipe(RecipeDto recipe, List<String> produce) {}

    public record SeasonDto(int month, List<Produce> produce, List<SeasonRecipe> recipes) {}

    static final int SEASON_LIMIT = 12;

    /**
     * 1.21: the fruits and vegetables of the month with their vitamins (their raw Ciqual food, when the table has it), and the
     * recipes the member can see that use the most of them, those made mostly of them first
     */
    public SeasonDto season(UUID userId, int month) {
        List<Season.Produce> produce = Season.of(month);
        Map<String, Map<String, Double>> micros = new HashMap<>();
        jdbc.query("select name, micros::text as micros from food where source = 'CIQUAL' and name = any(?)",
                rs -> {
                    micros.put(rs.getString("name"), fr.mbonnici.mybody365.nutrition.Micros.parse(rs.getString("micros")));
                }, (Object) produce.stream().map(Season.Produce::ciqual).toArray(String[]::new));
        Loaded l = load(userId);
        Map<String, String> idByKey = new LinkedHashMap<>();
        List<Produce> out = new ArrayList<>();
        for (Season.Produce p : produce) {
            String key = p.key();
            idByKey.putIfAbsent(key, p.id());
            out.add(new Produce(p.id(), p.kind().name(), key, l.counts().getOrDefault(key, 0),
                    fr.mbonnici.mybody365.nutrition.Micros.rounded(micros.getOrDefault(p.ciqual(), Map.of()))));
        }
        record Scored(Entry e, List<String> ids, double share) {}
        List<Scored> scored = new ArrayList<>();
        for (Entry e : l.entries()) {
            List<String> ids = e.keys().stream().filter(idByKey::containsKey).map(idByKey::get).toList();
            if (ids.isEmpty()) {
                continue;
            }
            long counted = e.keys().stream().filter(k -> !PANTRY.contains(k) && !k.startsWith("eau")).count();
            scored.add(new Scored(e, ids, ids.size() / (double) Math.max(1, counted)));
        }
        scored.sort(Comparator.comparingInt((Scored s) -> -s.ids().size()).thenComparingDouble(s -> -s.share())
                .thenComparing(s -> SearchText.normalize(s.e().name())));
        List<SeasonRecipe> recipesOut = new ArrayList<>();
        Set<String> names = new java.util.HashSet<>();
        for (Scored s : scored) {
            if (recipesOut.size() == SEASON_LIMIT) {
                break;
            }
            if (!names.add(SearchText.normalize(s.e().name()))) {
                continue;
            }
            recipesOut.add(new SeasonRecipe(recipes.dto(recipes.row(s.e().id()), userId, false), s.ids()));
        }
        return new SeasonDto(month, out, recipesOut);
    }

    private Loaded load(UUID userId) {
        Map<UUID, String> names = new LinkedHashMap<>();
        Map<UUID, Set<String>> keys = new HashMap<>();
        // per key, how each name reads and how often: the most frequent reading is the label
        Map<String, Map<String, Integer>> readings = new HashMap<>();
        jdbc.query("""
                select r.id, r.name, ri.name as food
                from recipe r join recipe_ingredient ri on ri.recipe_id = r.id
                where r.owner_id = ?
                   or (not r.hidden and (r.shared or (r.visibility <> 'PRIVATE' and r.owner_id in
                       (select user_b from friendship where user_a = ? union select user_a from friendship where user_b = ?))))""",
                rs -> {
                    UUID id = rs.getObject("id", UUID.class);
                    names.putIfAbsent(id, rs.getString("name"));
                    String food = rs.getString("food");
                    String k = RecipeLookalikes.key(food);
                    if (k != null) {
                        keys.computeIfAbsent(id, x -> new LinkedHashSet<>()).add(k);
                        readings.computeIfAbsent(k, x -> new HashMap<>()).merge(label(food), 1, Integer::sum);
                    }
                }, userId, userId, userId);
        List<Entry> entries = new ArrayList<>();
        Map<String, Integer> counts = new HashMap<>();
        names.forEach((id, name) -> {
            Set<String> ks = keys.getOrDefault(id, Set.of());
            entries.add(new Entry(id, name, ks));
            ks.forEach(k -> counts.merge(k, 1, Integer::sum));
        });
        Map<String, String> labels = new HashMap<>();
        readings.forEach((k, m) -> labels.put(k, m.entrySet().stream().max(Map.Entry.<String, Integer>comparingByValue()
                .thenComparing(e -> -e.getKey().length())).map(Map.Entry::getKey).orElse(k)));
        return new Loaded(entries, labels, counts);
    }

    private static final Pattern STATE = Pattern.compile("(?i)\\s+(crue?s?|cuite?s?|fraiche?s?|fraîche?s?|frais|nature|entier|entière|sans précision)$");

    /** « Crème 30% MG, fluide, UHT » → « Crème », « Emmental ou emmenthal, râpé » → « Emmental », « Oeuf cru » → « Oeuf » */
    static String label(String foodName) {
        String head = foodName.split(" · ")[0].split(",")[0].replaceAll("\\([^)]*\\)", " ");
        head = head.split(" ou ")[0];
        StringBuilder b = new StringBuilder();
        for (String w : head.trim().split("\\s+")) {
            if (w.matches(".*\\d.*") || w.equals("%") || w.equalsIgnoreCase("MG") || w.equals("à") || w.equalsIgnoreCase("minimum")) {
                continue;
            }
            b.append(b.isEmpty() ? "" : " ").append(w);
        }
        String out = b.toString();
        String before;
        do {
            before = out;
            out = STATE.matcher(out).replaceAll("");
        } while (!out.equals(before));
        out = out.isBlank() ? head.trim() : out.trim();
        return out.isEmpty() ? foodName : Character.toUpperCase(out.charAt(0)) + out.substring(1);
    }
}
