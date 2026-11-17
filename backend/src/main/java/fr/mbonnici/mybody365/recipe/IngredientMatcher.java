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
     * the wheat flour of pastry, not rice flour; « pâtes » are dry pasta, « thon » is canned in water): the
     * ingredient as written (brought to {@link #key}) and its Ciqual 2025 code. The other words of a line choose
     * among the rest (« farine T55 », « farine de riz »); the member checks the food shown on each line.
     */
    static final Map<String, String> USUAL_FOODS = keyed(
            // flours, grains, bread
            "farine", "9440", "farine ble", "9440", "farine complète", "9415", "farine intégrale", "9415", "farine semi complète", "9410",
            "maïzena", "9510", "fécule maïs", "9510", "riz", "9100", "riz blanc", "9100", "riz rond", "9100", "riz basmati", "9100",
            "riz complet", "9102", "pâtes", "9810", "pâtes complètes", "9870", "spaghetti", "9810", "tagliatelles", "9810", "penne", "9810",
            "coquillettes", "9810", "macaronis", "9810", "fusilli", "9810", "semoule", "9610", "couscous", "9610", "quinoa", "9340",
            "boulgour", "9690", "flocons d'avoine", "32140", "chapelure", "7500", "pain", "7000", "baguette", "7001", "pain complet", "7110",
            "pâte feuilletée", "23424", "pâte brisée", "23414", "pâte sablée", "23444",
            // dairy, eggs
            "beurre", "16400", "beurre doux", "16400", "beurre demi-sel", "16402", "margarine", "16080", "lait", "19033",
            "lait demi-écrémé", "19033", "lait entier", "19016", "lait écrémé", "19050", "crème", "19417", "crème liquide", "19417",
            "crème liquide entière", "19417", "crème entière", "19417", "crème fraîche", "19410", "crème fraîche épaisse", "19410",
            "crème épaisse", "19410", "crème légère", "19430", "crème liquide légère", "19436", "yaourt", "19593", "yaourt nature", "19593",
            "yaourt grec", "19860", "yaourt à la grecque", "19860", "fromage blanc", "19501", "skyr", "19724", "mascarpone", "19584",
            "ricotta", "12069", "mozzarella", "19590", "parmesan", "12120", "emmental", "12115", "emmental râpé", "12118",
            "gruyère", "12114", "gruyère râpé", "12775", "fromage râpé", "12775", "comté", "12110", "chèvre", "12812",
            "fromage de chèvre", "12812", "chèvre frais", "12805", "feta", "12066", "oeuf", "22000", "oeuf entier", "22000",
            "jaune d'oeuf", "22002", "jaune", "22002", "blanc d'oeuf", "22001",
            // vegetable drinks
            "lait de coco", "18041", "crème de coco", "18041", "lait d'amande", "18111", "lait d'avoine", "18899", "lait de soja", "18113",
            // sugars, chocolate, baking
            "sucre", "31016", "sucre en poudre", "31016", "sucre semoule", "31016", "sucre blanc", "31016", "sucre glace", "31016",
            "cassonade", "31017", "sucre roux", "31017", "sucre cassonade", "31017", "sucre vanillé", "31044", "miel", "31008",
            "sirop d'érable", "31034", "chocolat noir", "31085", "chocolat noir pâtissier", "31085", "chocolat pâtissier", "31085",
            "pépites de chocolat", "31085", "chocolat au lait", "31004", "chocolat blanc", "31010", "cacao", "18100", "cacao en poudre", "18100",
            "gélatine", "11007", "poudre d'amande", "15041", "amande en poudre", "15041", "vanille", "11098", "gousse de vanille", "11098",
            "extrait de vanille", "11098", "levure chimique", "11046", "levure de boulanger", "11010", "bicarbonate", "11507",
            // fats, seasonings, sauces
            "huile", "17440", "huile de tournesol", "17440", "huile de colza", "17130", "huile d'olive", "17270", "sel", "11058",
            "sel fin", "11058", "fleur de sel", "11082", "poivre", "11015", "moutarde", "11013", "vinaigre", "11018",
            "vinaigre balsamique", "11091", "sauce soja", "11104", "concentré de tomate", "20068", "coulis de tomate", "20260",
            "sauce tomate", "20260", "tomates concassées", "20137", "tomates pelées", "20137", "bouillon", "11041", "cube de bouillon", "11041",
            "ketchup", "11008", "mayonnaise", "11054", "pesto", "11179", "vin blanc", "5215", "vin rouge", "5214", "cannelle", "11025",
            "curry", "11005", "paprika", "11049", "cumin", "11042", "muscade", "11048", "noix de muscade", "11048", "thym", "11070",
            "romarin", "11068", "persil", "11014", "basilic", "11033", "ciboulette", "11003", "coriandre", "11094", "menthe", "11027",
            "eau", "18066", "tahini", "15203",
            // meat, fish
            "jambon", "28910", "jambon blanc", "28910", "jambon cuit", "28910", "jambon cru", "28800", "lardons", "28720",
            "poulet", "36017", "blanc de poulet", "36017", "filet de poulet", "36017", "escalope de poulet", "36017",
            "cuisse de poulet", "36002", "dinde", "36304", "escalope de dinde", "36304", "steak haché", "6254", "boeuf haché", "6254",
            "viande hachée", "6254", "steak haché 5", "6250", "veau", "6521", "escalope de veau", "6521", "porc", "28300",
            "filet mignon", "28204", "côte de porc", "28100", "agneau", "21502", "saucisse", "30110", "chorizo", "30315",
            "saumon", "26036", "pavé de saumon", "26036", "thon", "26039", "cabillaud", "26043", "crevettes", "10007", "tofu", "20904",
            // vegetables, legumes
            "ail", "11000", "gousse d'ail", "11000", "pomme de terre", "4008", "patate douce", "4101", "carotte", "20009",
            "courgette", "20020", "poivron", "20041", "champignons", "20056", "champignons de Paris", "20056", "épinards", "20059",
            "salade", "25604", "laitue", "20031", "concombre", "20019", "aubergine", "20053", "brocoli", "20057",
            "haricots verts", "20061", "petits pois", "20072", "maïs", "20066", "poireau", "20039", "avocat", "13004", "radis", "20045",
            "asperges", "20279", "chou-fleur", "20016", "lentilles", "20359", "lentilles corail", "20535", "lentilles vertes", "20585",
            "pois chiches", "20532", "haricots rouges", "20524",
            // fruit, nuts
            "citron", "13009", "jus de citron", "2028", "citron vert", "13067", "pomme", "13396", "banane", "13005", "fraises", "13014",
            "framboises", "13015", "orange", "13034", "poire", "13397", "mangue", "13025", "ananas", "13002", "myrtilles", "13028",
            "raisins secs", "13046", "amandes", "15000", "noix", "15005", "cerneaux de noix", "15005", "noisettes", "15004",
            "noix de coco râpée", "15007", "coco râpée", "15007", "graines de chia", "15047", "chia", "15047",
            "beurre de cacahuète", "15202", "cacahuètes", "15001");

    /** what one piece weighs, edible part only (Ciqual's values are for it): « 2 œufs », « 3 gousses d'ail » */
    static final Map<String, Double> PIECES = keyed(
            "oeuf", 50.0, "jaune d'oeuf", 20.0, "blanc d'oeuf", 30.0, "jaune", 20.0, "blanc", 30.0, "ail", 5.0, "échalote", 27.0,
            "oignon", 90.0, "carotte", 90.0, "pomme", 135.0, "poire", 135.0, "banane", 115.0, "orange", 146.0, "clémentine", 52.0,
            "citron", 120.0, "citron vert", 70.0, "avocat", 148.0, "mangue", 276.0, "kiwi", 69.0, "fraise", 15.0, "tomate", 120.0,
            "tomate cerise", 15.0, "courgette", 250.0, "aubergine", 300.0, "poivron", 123.0, "concombre", 300.0, "poireau", 150.0,
            "champignon", 20.0, "radis", 10.0, "pomme de terre", 128.0, "patate douce", 300.0, "yaourt", 125.0, "mozzarella", 125.0,
            "levure chimique", 11.0, "sucre vanillé", 7.5, "gélatine", 2.0, "vanille", 3.0, "jambon", 45.0, "pain de mie", 25.0,
            "baguette", 250.0, "cube de bouillon", 10.0, "bouillon", 10.0, "steak haché", 100.0, "escalope", 120.0,
            "escalope de poulet", 120.0, "escalope de dinde", 120.0, "escalope de veau", 120.0, "blanc de poulet", 130.0,
            "filet de poulet", 130.0, "cuisse de poulet", 140.0, "pavé de saumon", 125.0, "saucisse", 100.0, "thym", 1.0,
            "romarin", 1.0, "laurier", 0.2, "persil", 30.0, "coriandre", 30.0, "ciboulette", 20.0, "basilic", 20.0, "menthe", 20.0);

    /** the words before an ingredient that count it: « 3 gousses d'ail », « 1 boîte de thon », « 1 noix de beurre » */
    private static final Pattern CONTAINER = Pattern.compile("^(gousses?|tranches?|sachets?|feuilles?|branches?|brins?|bouquets?|pots?|boules?"
            + "|rouleaux|rouleau|cubes?|poignées?|boîtes?|boites?|bottes?|filets?|verres?|tasses?|bols?|briques?|carrés?|noix|noisettes?)"
            + "\\b\\s*(.*)$", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    /**
     * What one container holds, by what is in it (null: the ingredient's own piece weight counts, « 2 tranches de
     * jambon »): a handful 30 g, a glass 200 ml, a cup 240 ml, a bowl 300 ml, a can (tuna 140 g, pulses or sweetcorn
     * drained 260 g, tomatoes or coconut milk 400 g), a bunch (herbs 50 g, radishes 200 g), a drizzle 5 g (a fillet of
     * fish or meat 140 g), a knob of butter 10 g (a small one 5 g), a square of chocolate 5 g.
     */
    static Double containerWeight(String container, String ingredientKey) {
        String c = singular(fold(container));
        String k = ingredientKey;
        return switch (c) {
            case "poignee" -> 30.0;
            case "verre" -> 200.0;
            case "tasse" -> 240.0;
            case "bol" -> 300.0;
            case "brique" -> k.startsWith("lait") && !k.contains("coco") ? 1000.0 : 200.0;
            case "boite" -> k.startsWith("thon") ? 140.0
                    : k.matches("(poi chiche|haricot|lentille|flageolet|petit poi|mai)\\b.*") ? 260.0
                    : k.startsWith("tomate") || k.contains("coco") ? 400.0 : 300.0;
            case "botte" -> k.matches("(persil|coriandre|ciboulette|menthe|basilic|aneth|cerfeuil)\\b.*") ? 50.0
                    : k.startsWith("radi") ? 200.0 : k.startsWith("asperge") ? 500.0 : 250.0;
            case "filet" -> k.matches("(huile|vinaigre|citron|jus|sauce|sirop|miel|creme|lait)\\b.*") ? 5.0 : 140.0;
            case "noi" -> k.startsWith("beurre") || k.startsWith("margarine") ? 10.0 : null;
            case "noisette" -> k.startsWith("beurre") || k.startsWith("margarine") ? 5.0 : null;
            case "carre" -> k.startsWith("chocolat") ? 5.0 : null;
            default -> null;
        };
    }

    /** a table written as the ingredients read (« pois chiches »), looked up as {@link #key} writes them */
    @SuppressWarnings("unchecked")
    private static <V> Map<String, V> keyed(Object... pairs) {
        Map<String, V> m = new java.util.HashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            m.put(key((String) pairs[i]), (V) pairs[i + 1]);
        }
        return Map.copyOf(m);
    }

    private static String fold(String s) {
        return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT);
    }

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
            if (!all.isEmpty() && (food == null || p.grams() == null)) {
                missed(p.name(), line, food == null ? "FOOD" : "WEIGHT");
            }
        }
        return out;
    }

    /**
     * A line without a food, or without a weight, is kept for the admins (« what to add to the tables »): the
     * ingredient as {@link #key} writes it, an example of the line, how many times. No account goes with it.
     */
    private void missed(String name, String line, String reason) {
        String k = key(name);
        if (k.isBlank()) {
            return;
        }
        try {
            jdbc.update("""
                    insert into ingredient_miss (key, reason, example, count, last_at) values (?, ?, ?, 1, now())
                    on conflict (key, reason) do update set count = ingredient_miss.count + 1, example = excluded.example, last_at = now()""",
                    k.length() > 120 ? k.substring(0, 120) : k, reason, line.length() > 300 ? line.substring(0, 300) : line);
        } catch (RuntimeException e) {
            // the import goes on: this list is only a help
        }
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
        // « 1 boîte de thon »: what the container holds; « 2 tranches de jambon »: the ingredient's piece
        Matcher c = CONTAINER.matcher(rest);
        boolean held = c.matches() && !ingredient(c.group(2)).isEmpty();
        String name = ingredient(held ? c.group(2) : rest);
        Double each = held ? containerWeight(c.group(1), key(name)) : null;
        if (each == null) {
            each = piece(name);
        }
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
