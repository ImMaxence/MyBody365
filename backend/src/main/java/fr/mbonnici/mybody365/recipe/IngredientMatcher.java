package fr.mbonnici.mybody365.recipe;

import fr.mbonnici.mybody365.nutrition.FoodService;
import fr.mbonnici.mybody365.nutrition.FoodService.FoodDto;
import fr.mbonnici.mybody365.nutrition.FoodStore;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The foods of the Ciqual table an imported recipe's ingredients most probably are, with their weights:
 * "180 g Chocolat noir (en pépites)" → "Chocolat noir 40% de cacao et plus, à pâtisser" · 180 g, "2 œufs" →
 * "Oeuf cru" · 100 g. The recipe's calories and Nutri-Score are then computed like those of any recipe, and the
 * member checks each line. A line without a weight that can be known (« sel, poivre ») is left to the member.
 */
@Service
public class IngredientMatcher {

    /** a line of the recipe; food and grams are null when not found */
    public record Match(String line, Double grams, FoodDto food) {}

    /** what a line says: the weight (null when unknown) and what it is */
    record Parsed(Double grams, String name) {}

    record Candidate(UUID id, String code, String name, String category, List<String> words) {}

    private static final Pattern NOT_A_WORD = Pattern.compile("[^\\p{L}\\p{N}]+");
    private static final Set<String> SMALL_WORDS = Set.of("de", "du", "des", "la", "le", "les", "l", "d", "a", "au", "aux", "en", "et",
            "ou", "un", "une", "pour", "avec");

    /**
     * What a home recipe means by its most common ingredients, which the names alone leave open (a « farine » is
     * wheat flour, not rice flour): the ingredient, as {@link #key} writes it, and its Ciqual code.
     */
    static final Map<String, String> USUAL_FOODS = Map.ofEntries(Map.entry("farine", "9440"), Map.entry("farine ble", "9440"),
            Map.entry("beurre", "16400"), Map.entry("beurre doux", "16400"), Map.entry("sucre", "31016"), Map.entry("sucre poudre", "31016"),
            Map.entry("sucre semoule", "31016"), Map.entry("sucre blanc", "31016"), Map.entry("sucre glace", "31016"),
            Map.entry("cassonade", "31017"), Map.entry("sucre roux", "31017"), Map.entry("sucre cassonade", "31017"),
            Map.entry("sucre vanille", "31044"), Map.entry("oeuf", "22000"), Map.entry("oeuf entier", "22000"), Map.entry("jaune oeuf", "22002"),
            Map.entry("jaune", "22002"), Map.entry("blanc oeuf", "22001"), Map.entry("lait", "19033"), Map.entry("creme", "19417"),
            Map.entry("creme liquide", "19417"), Map.entry("creme liquide entiere", "19417"), Map.entry("creme entiere", "19417"),
            Map.entry("creme fraiche", "19410"), Map.entry("creme fraiche epaisse", "19410"), Map.entry("creme epaisse", "19410"),
            Map.entry("chocolat noir", "31085"), Map.entry("chocolat noir patissier", "31085"), Map.entry("chocolat patissier", "31085"),
            Map.entry("chocolat lait", "31004"), Map.entry("chocolat blanc", "31010"), Map.entry("sel", "11058"), Map.entry("sel fin", "11058"),
            Map.entry("fleur sel", "11082"), Map.entry("poivre", "11015"), Map.entry("eau", "18066"), Map.entry("miel", "31008"),
            Map.entry("maizena", "9510"), Map.entry("fecule mai", "9510"), Map.entry("cacao", "18100"), Map.entry("cacao poudre", "18100"),
            Map.entry("gelatine", "11007"), Map.entry("poudre amande", "15041"), Map.entry("amande poudre", "15041"),
            Map.entry("vanille", "11057"), Map.entry("gousse vanille", "11057"), Map.entry("extrait vanille", "11098"),
            Map.entry("levure boulanger", "11010"), Map.entry("jus citron", "2028"), Map.entry("citron", "13009"),
            Map.entry("citron vert", "13067"), Map.entry("pomme", "13396"), Map.entry("pomme terre", "4008"), Map.entry("tahini", "15203"),
            Map.entry("skyr", "19724"), Map.entry("huile olive", "17270"), Map.entry("ail", "11000"), Map.entry("gousse ail", "11000"),
            Map.entry("jambon", "28910"), Map.entry("jambon blanc", "28910"), Map.entry("jambon cuit", "28910"),
            Map.entry("blanc poulet", "36017"), Map.entry("filet poulet", "36017"), Map.entry("spaghetti", "9810"),
            Map.entry("tagliatelle", "9810"), Map.entry("penne", "9810"), Map.entry("coquillette", "9810"), Map.entry("macaroni", "9810"),
            Map.entry("fusilli", "9810"));

    /** what one piece weighs, edible part only (Ciqual's values are for it): « 2 œufs », « 3 gousses d'ail » */
    static final Map<String, Double> PIECES = Map.ofEntries(Map.entry("oeuf", 50.0), Map.entry("jaune oeuf", 20.0),
            Map.entry("blanc oeuf", 30.0), Map.entry("jaune", 20.0), Map.entry("blanc", 30.0), Map.entry("ail", 5.0),
            Map.entry("echalote", 27.0), Map.entry("oignon", 90.0), Map.entry("carotte", 90.0), Map.entry("pomme", 135.0),
            Map.entry("poire", 135.0), Map.entry("banane", 115.0), Map.entry("orange", 146.0), Map.entry("clementine", 52.0),
            Map.entry("citron", 120.0), Map.entry("citron vert", 70.0), Map.entry("avocat", 148.0), Map.entry("mangue", 276.0),
            Map.entry("kiwi", 69.0), Map.entry("tomate", 120.0), Map.entry("tomate cerise", 15.0), Map.entry("courgette", 250.0),
            Map.entry("aubergine", 300.0), Map.entry("poivron", 123.0), Map.entry("concombre", 300.0), Map.entry("pomme terre", 128.0),
            Map.entry("yaourt", 125.0), Map.entry("mozzarella", 125.0), Map.entry("levure chimique", 11.0), Map.entry("sucre vanille", 7.5),
            Map.entry("gelatine", 2.0), Map.entry("vanille", 3.0), Map.entry("jambon", 45.0), Map.entry("pain mie", 25.0),
            Map.entry("cube bouillon", 10.0), Map.entry("bouillon", 10.0));

    /** the words before an ingredient that count pieces of it: « 3 gousses d'ail » */
    private static final Pattern CONTAINER = Pattern.compile(
            "^(gousses?|tranches?|sachets?|feuilles?|branches?|brins?|bouquets?|pots?|boules?|rouleaux|rouleau|cubes?)\\b\\s*(.*)$",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    /** a unit after the quantity, and what one of it weighs (liquids: 1 ml ≈ 1 g) */
    private static final List<Map.Entry<Pattern, Double>> UNITS = List.of(
            Map.entry(unit("kg|kilos?|kilogrammes?"), 1000.0),
            Map.entry(unit("mg|milligrammes?"), 0.001),
            Map.entry(unit("g|gr|grs|grammes?"), 1.0),
            Map.entry(unit("ml|millilitres?"), 1.0),
            Map.entry(unit("cl|centilitres?"), 10.0),
            Map.entry(unit("dl|décilitres?|decilitres?"), 100.0),
            Map.entry(unit("l|litres?"), 1000.0),
            Map.entry(unit("(?:cuill[eè]res?|cuil\\.?|c\\.?)\\s*(?:à|a)\\.?\\s*(?:soupe|s\\.?)|cs|cas|càs|tbsp|tablespoons?"), 15.0),
            Map.entry(unit("(?:cuill[eè]res?|cuil\\.?|c\\.?)\\s*(?:à|a)\\.?\\s*(?:caf[eé]|c\\.?)|cc|cac|càc|tsp|teaspoons?"), 5.0),
            Map.entry(unit("pinc[eé]es?"), 0.5));

    private static final Pattern QUANTITY = Pattern.compile("^(\\d+(?:[.,]\\d+)?(?:\\s*/\\s*\\d+)?|[½¼¾⅓⅔])\\s*(.*)$");
    /** « 2 à 3 œufs »: the middle */
    private static final Pattern RANGE = Pattern.compile("^(?:à|a|-|–)\\s*(\\d+(?:[.,]\\d+)?)\\s*(.*)$");
    private static final Pattern BRACKETS = Pattern.compile("\\([^()]*\\)");

    /** cooked, fried, canned: a recipe starts from raw ingredients, they come after the raw ones */
    private static final Set<String> PREPARED = Set.of("cuit", "cuite", "cuits", "cuites", "bouilli", "bouillie", "bouillis", "roti",
            "rotie", "grille", "grillee", "frit", "frite", "prefrit", "prefrite", "appertise", "appertisee");

    /** the Ciqual subgroups of dishes and baby foods: an ingredient is rarely one */
    private static final Set<String> DISHES = Set.of("salades composées et crudités", "soupes", "plats composés",
            "pizzas, tartes et crêpes salées", "sandwichs", "feuilletées et autres entrées", "laits et boissons infantiles",
            "petits pots salés et plats infantiles", "desserts infantiles", "céréales et biscuits infantiles");

    private final JdbcTemplate jdbc;
    private final FoodStore store;
    private final FoodService foods;
    private volatile String loadedVersion;
    private volatile List<Candidate> table = List.of();

    public IngredientMatcher(JdbcTemplate jdbc, FoodStore store, FoodService foods) {
        this.jdbc = jdbc;
        this.store = store;
        this.foods = foods;
    }

    public List<Match> match(UUID viewer, List<String> lines) {
        List<Candidate> all = table();
        List<Match> out = new ArrayList<>();
        for (String line : lines) {
            Parsed p = parse(line);
            Candidate c = all.isEmpty() ? null : suggest(all, p.name());
            FoodDto food = c == null ? null : store.find(c.id()).map(f -> foods.dto(f, viewer)).orElse(null);
            out.add(new Match(line, food == null ? null : p.grams(), food));
        }
        return out;
    }

    /** the Ciqual table, read again after each import */
    private List<Candidate> table() {
        String version = jdbc.queryForObject("""
                select count(*) || ':' || coalesce(max(source_version), '') || ':' || coalesce(max(updated_at)::text, '')
                from food where source = 'CIQUAL' and not superseded""", String.class);
        if (!version.equals(loadedVersion)) {
            synchronized (this) {
                if (!version.equals(loadedVersion)) {
                    table = jdbc.query("select id, source_code, name, category from food where source = 'CIQUAL' and not superseded",
                            (rs, i) -> new Candidate(rs.getObject("id", UUID.class), rs.getString("source_code"), rs.getString("name"),
                                    rs.getString("category"), words(rs.getString("name"))));
                    loadedVersion = version;
                }
            }
        }
        return table;
    }

    /** « 180 g Chocolat noir (en pépites) » → 180, « Chocolat noir »; « 2 œufs » → 100, « œufs »; « Sel » → null, « Sel » */
    static Parsed parse(String line) {
        String s = line == null ? "" : line.replace(' ', ' ');
        for (String before = null; !s.equals(before); ) {
            before = s;
            s = BRACKETS.matcher(s).replaceAll(" ");
        }
        // a bracket left open, then what follows a comma or a colon: a remark
        // (« 1,5 kg » keeps its comma)
        s = s.replaceAll("[(\\[].*$", "").replaceAll("(?:(?<!\\d),|,(?!\\d)|[:;]).*$", "").replaceAll("\\s+", " ").strip();
        Matcher q = QUANTITY.matcher(s);
        if (!q.matches()) {
            return new Parsed(null, s);
        }
        double n = amount(q.group(1));
        String rest = q.group(2).strip();
        Matcher range = RANGE.matcher(rest);
        if (range.matches()) {
            n = (n + amount(range.group(1))) / 2;
            rest = range.group(2).strip();
        }
        for (Map.Entry<Pattern, Double> u : UNITS) {
            Matcher m = u.getKey().matcher(rest);
            if (m.matches()) {
                return new Parsed(round(n * u.getValue()), ingredient(m.group(1)));
            }
        }
        Matcher c = CONTAINER.matcher(rest);
        String name = ingredient(c.matches() ? c.group(2) : rest);
        Double each = piece(name);
        return new Parsed(each == null || n <= 0 ? null : round(n * each), name);
    }

    private static Pattern unit(String names) {
        return Pattern.compile("^(?:" + names + ")(?=[\\s.'’]|$)\\.?\\s*(.*)$", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    }

    private static double amount(String q) {
        return switch (q) {
            case "½" -> 0.5;
            case "¼" -> 0.25;
            case "¾" -> 0.75;
            case "⅓" -> 1 / 3.0;
            case "⅔" -> 2 / 3.0;
            default -> {
                String[] parts = q.replace(',', '.').split("\\s*/\\s*");
                double v = Double.parseDouble(parts[0]);
                yield parts.length == 2 && Double.parseDouble(parts[1]) > 0 ? v / Double.parseDouble(parts[1]) : v;
            }
        };
    }

    /** « de farine », « d'huile » → « farine », « huile » */
    private static String ingredient(String s) {
        return s.strip().replaceFirst("(?iu)^(de |d['’]\\s*|des |du )", "").strip();
    }

    private static Double piece(String name) {
        List<String> w = words(name).stream().map(IngredientMatcher::singular).toList();
        // « Pommes de terre nouvelles » is a potato, « Blanc de poulet » is not an egg white
        for (int n = Math.min(3, w.size()); n >= 1; n--) {
            Double g = PIECES.get(String.join(" ", w.subList(0, n)));
            if (g != null && !(n == 1 && w.size() > 1 && (w.getFirst().equals("blanc") || w.getFirst().equals("jaune")) && !w.get(1).equals("oeuf"))) {
                return g;
            }
        }
        return null;
    }

    private static double round(double g) {
        return Math.round(g * 10) / 10.0;
    }

    /** the food an ingredient most probably is: its usual one when common, else the closest having its first word */
    static Candidate suggest(List<Candidate> foods, String name) {
        List<String> named = words(name).stream().filter(w -> !w.chars().allMatch(Character::isDigit)).toList();
        if (named.isEmpty()) {
            return null;
        }
        String usual = USUAL_FOODS.get(key(name));
        if (usual != null) {
            for (Candidate c : foods) {
                if (usual.equals(c.code())) {
                    return c;
                }
            }
        }
        String first = named.getFirst();
        String usualOfFirst = USUAL_FOODS.get(singular(first));
        return foods.stream()
                .filter(c -> contains(c.words(), first))
                .map(c -> {
                    int matched = matched(c.words(), named);
                    double score = closeness(c, first, matched) + (c.code().equals(usualOfFirst) ? 3 : 0);
                    return Map.entry(c, new double[] {matched, score});
                })
                .sorted(Comparator.comparingDouble((Map.Entry<Candidate, double[]> e) -> -e.getValue()[0])
                        .thenComparingDouble(e -> -e.getValue()[1])
                        .thenComparingInt(e -> e.getKey().name().length()))
                .map(Map.Entry::getKey)
                .findFirst().orElse(null);
    }

    /**
     * Higher for a food named first by that word, an average food (« aliment moyen », the table's own default),
     * a raw one, a short name; lower for a cooked one, a dish or a baby food.
     */
    private static double closeness(Candidate c, String first, int matched) {
        List<String> own = c.words();
        double closeness = 0;
        if (!own.isEmpty() && (own.getFirst().startsWith(first) || sameWord(own.getFirst(), first))) {
            closeness += 3;
        }
        if (own.contains("moyen") && own.contains("aliment")) {
            closeness += 3;
        }
        if (own.contains("cru") || own.contains("crue")) {
            closeness += 1;
        }
        if (own.stream().anyMatch(PREPARED::contains)) {
            closeness -= 1;
        }
        if (c.category() != null && DISHES.contains(c.category().toLowerCase(Locale.ROOT))) {
            closeness -= 2;
        }
        if (own.stream().anyMatch(w -> w.startsWith("preemballe"))) {
            closeness -= 1;
        }
        return closeness - 0.5 * Math.max(0, own.size() - Math.max(matched, 1));
    }

    private static int matched(List<String> own, List<String> named) {
        return (int) named.stream().filter(w -> contains(own, w)).count();
    }

    private static boolean contains(List<String> own, String word) {
        return own.stream().anyMatch(o -> sameWord(o, word));
    }

    /** « oeufs » and « oeuf », « choux » and « chou »: the same word */
    private static boolean sameWord(String a, String b) {
        return a.equals(b) || singular(a).equals(singular(b));
    }

    private static String singular(String w) {
        return w.length() > 3 && (w.endsWith("s") || w.endsWith("x")) ? w.substring(0, w.length() - 1) : w;
    }

    /** « Jaunes d'œufs » → « jaune oeuf »: folded, small words left out, each word in the singular */
    static String key(String name) {
        return words(name).stream().map(IngredientMatcher::singular).collect(Collectors.joining(" "));
    }

    static List<String> words(String text) {
        String folded = Normalizer.normalize(text == null ? "" : text, Normalizer.Form.NFD).replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT).replace("œ", "oe").replace("æ", "ae");
        return Arrays.stream(NOT_A_WORD.split(folded)).filter(w -> !w.isEmpty() && !SMALL_WORDS.contains(w)).toList();
    }

    /** for the tests: a candidate as the table holds it */
    static Candidate candidate(String code, String name, String category) {
        return new Candidate(UUID.randomUUID(), code, name, category, words(name));
    }
}
