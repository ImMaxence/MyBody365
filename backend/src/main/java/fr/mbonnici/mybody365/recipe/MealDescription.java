package fr.mbonnici.mybody365.recipe;

import fr.mbonnici.mybody365.nutrition.FoodService;
import fr.mbonnici.mybody365.nutrition.FoodService.FoodDto;
import fr.mbonnici.mybody365.nutrition.FoodStore;
import fr.mbonnici.mybody365.recipe.IngredientMatcher.Candidate;
import fr.mbonnici.mybody365.recipe.IngredientMatcher.Parsed;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * 1.19: « Décris ton repas »: « 200 g de poulet, du riz et une pomme » written or dictated, each part a food of the Ciqual
 * table with its weight as eaten. The matcher of the recipe imports does the reading ({@link IngredientMatcher}): the
 * quantity, the units, the pieces (« 2 œufs » → 100 g). A recipe weighs its ingredients raw; a meal is eaten cooked, so the
 * staples of a plate are taken cooked (rice, pasta, pulses, meat, fish), and a part without a quantity gets the usual
 * portion of a plate (« du riz » → 160 g of cooked rice). The member checks each line before it is noted.
 */
@Service
public class MealDescription {

    /** a part of the description: the food found (none: not found) and its weight, guessed when no quantity was said */
    public record Described(String text, FoodDto food, double grams, boolean guessed) {}

    /** at most this many parts in one description */
    static final int MAX_PARTS = 12;

    private static final Pattern SPLIT = Pattern.compile("\\s*(?:\\n|,|;|\\+|&|\\bet\\b|\\bavec\\b|\\bpuis\\b)\\s*",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    /** a number said in words at the start of a part (« une pomme », « deux œufs », « une demi baguette ») */
    private static final Map<String, String> NUMBERS = Map.ofEntries(Map.entry("un", "1"), Map.entry("une", "1"), Map.entry("deux", "2"),
            Map.entry("trois", "3"), Map.entry("quatre", "4"), Map.entry("cinq", "5"), Map.entry("six", "6"), Map.entry("sept", "7"),
            Map.entry("huit", "8"), Map.entry("neuf", "9"), Map.entry("dix", "10"), Map.entry("onze", "11"), Map.entry("douze", "12"),
            Map.entry("quinze", "15"), Map.entry("vingt", "20"), Map.entry("quelques", "3"), Map.entry("demi", "0.5"), Map.entry("demie", "0.5"));
    private static final Pattern HALF = Pattern.compile("^(?:(?:une?|la)\\s+)?(?:demi|demie|moitié)\\s*(?:-\\s*)?(?:de\\s+|d'|d’)?(.*)$",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern QUARTER = Pattern.compile("^(?:un\\s+)?quart\\s*(?:de\\s+|d'|d’)?(.*)$", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern LEADING_ARTICLE = Pattern.compile("^(?:du|de la|de l'|de l’|des|le|la|les|l'|l’|mon|ma|mes)\\s*",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    /** the staples as they are eaten (cooked), where a recipe means them raw: the part's key and its Ciqual 2025 code */
    static final Map<String, String> EATEN = keyed(
            "riz", "9104", "riz blanc", "9104", "riz rond", "9104", "riz basmati", "9124", "riz thaï", "9124", "riz complet", "9103",
            "pâtes", "9811", "spaghetti", "9811", "spaghettis", "9811", "tagliatelles", "9811", "penne", "9811", "coquillettes", "9811",
            "macaronis", "9811", "fusilli", "9811", "pâtes complètes", "9877", "quinoa", "9341", "boulgour", "9691",
            "lentilles", "20587", "lentilles vertes", "20587", "lentilles corail", "20589", "pois chiches", "20532", "haricots rouges", "20524",
            "pomme de terre", "4003", "patate", "4003", "purée", "4040", "purée de pomme de terre", "4040", "frites", "4032",
            "patate douce", "4102", "poulet", "36018", "blanc de poulet", "36018", "filet de poulet", "36018", "escalope de poulet", "36018",
            "cuisse de poulet", "36006", "dinde", "36308", "escalope de dinde", "36308", "steak haché", "6259", "boeuf haché", "6259",
            "viande hachée", "6259", "steak", "6200", "bifteck", "6200", "porc", "28101", "côte de porc", "28101", "saumon", "25996",
            "pavé de saumon", "25996", "cabillaud", "25997", "oeuf dur", "22010", "café", "18004", "thé", "18020", "jus d'orange", "2070",
            "coca", "18018", "coca cola", "18018", "coca zéro", "18060", "bière", "5001");

    /** what a plate usually holds of a part said without a quantity (grams, or ml for a drink) */
    static final Map<String, Double> PORTIONS = keyed(
            "riz", 160.0, "pâtes", 200.0, "spaghetti", 200.0, "quinoa", 150.0, "boulgour", 150.0, "semoule", 150.0, "couscous", 150.0,
            "lentilles", 150.0, "pois chiches", 120.0, "haricots rouges", 120.0, "pomme de terre", 200.0, "purée", 200.0, "frites", 150.0,
            "patate douce", 200.0, "poulet", 120.0, "dinde", 120.0, "steak haché", 100.0, "steak", 150.0, "porc", 150.0, "saumon", 125.0,
            "cabillaud", 130.0, "thon", 80.0, "jambon", 45.0, "oeuf", 50.0, "pain", 50.0, "baguette", 50.0, "biscotte", 10.0,
            "céréales", 40.0, "flocons d'avoine", 40.0, "muesli", 50.0, "fromage", 30.0, "beurre", 10.0, "confiture", 20.0, "miel", 15.0,
            "sucre", 5.0, "huile", 10.0, "huile d'olive", 10.0, "mayonnaise", 20.0, "ketchup", 15.0, "moutarde", 5.0, "vinaigrette", 15.0,
            "pesto", 20.0, "yaourt", 125.0, "fromage blanc", 100.0, "skyr", 150.0, "compote", 100.0, "salade", 50.0, "tomate", 120.0,
            "haricots verts", 150.0, "brocoli", 150.0, "courgette", 150.0, "carotte", 100.0, "épinards", 150.0, "petits pois", 150.0,
            "légumes", 150.0, "soupe", 250.0, "café", 150.0, "thé", 250.0, "lait", 200.0, "jus d'orange", 200.0, "jus", 200.0,
            "coca", 330.0, "bière", 330.0, "vin", 125.0, "vin rouge", 125.0, "vin blanc", 125.0, "eau", 250.0, "chocolat", 20.0,
            "chocolat noir", 20.0, "biscuits", 30.0, "gâteau", 80.0, "glace", 100.0);

    /** a part without a quantity whose food is in none of the above: the usual portion of its group of the table */
    static final Map<String, Double> BY_CATEGORY = Map.ofEntries(Map.entry("plats composés", 300.0), Map.entry("soupes", 250.0),
            Map.entry("sauces", 20.0), Map.entry("huiles et graisses végétales", 10.0), Map.entry("beurres", 10.0), Map.entry("margarines", 10.0),
            Map.entry("fromages et alternatives végétales", 30.0), Map.entry("viandes cuites", 120.0), Map.entry("viandes crues", 120.0),
            Map.entry("poissons cuits", 125.0), Map.entry("poissons crus", 125.0), Map.entry("légumes", 150.0), Map.entry("fruits", 130.0),
            Map.entry("pâtes, riz et céréales", 150.0), Map.entry("pains et assimilés", 50.0), Map.entry("boissons sans alcool", 200.0),
            Map.entry("eaux", 250.0), Map.entry("laits", 200.0), Map.entry("boisson alcoolisées", 150.0), Map.entry("gâteaux et pâtisseries", 80.0),
            Map.entry("biscuits sucrés", 30.0), Map.entry("glaces", 100.0), Map.entry("chocolats et produits à base de chocolat", 20.0),
            Map.entry("confiseries non chocolatées", 20.0), Map.entry("produits laitiers frais et alternatives végétales", 125.0),
            Map.entry("céréales de petit-déjeuner", 40.0), Map.entry("viennoiseries", 60.0), Map.entry("pizzas, tartes et crêpes salées", 150.0),
            Map.entry("sandwichs", 250.0), Map.entry("salades composées et crudités", 200.0), Map.entry("charcuteries et alternatives végétales", 40.0),
            Map.entry("oeufs", 50.0), Map.entry("fruits à coque et graines oléagineuses", 25.0));

    private final IngredientMatcher matcher;
    private final FoodStore store;
    private final FoodService foods;

    public MealDescription(IngredientMatcher matcher, FoodStore store, FoodService foods) {
        this.matcher = matcher;
        this.store = store;
        this.foods = foods;
    }

    public List<Described> describe(UUID viewer, String text) {
        List<Candidate> all = matcher.table();
        List<Described> out = new ArrayList<>();
        for (String part : parts(text)) {
            Parsed p = IngredientMatcher.parse(digits(part));
            String k = IngredientMatcher.key(p.name());
            Candidate c = null;
            String code = EATEN.get(k);
            if (code != null) {
                c = all.stream().filter(x -> code.equals(x.code())).findFirst().orElse(null);
            }
            if (c == null && !all.isEmpty() && !k.isBlank()) {
                c = IngredientMatcher.suggest(all, p.name());
            }
            FoodDto food = c == null ? null : store.find(c.id()).map(f -> foods.dto(f, viewer)).orElse(null);
            boolean guessed = p.grams() == null;
            double grams = food == null ? 0 : guessed ? portion(k, food.category()) : p.grams();
            out.add(new Described(part, food, Math.round(grams), guessed));
        }
        return out;
    }

    /** « 200 g de poulet, du riz et une pomme » → its parts, at most MAX_PARTS */
    static List<String> parts(String text) {
        return Arrays.stream(SPLIT.split(text == null ? "" : text.strip())).map(String::strip).filter(s -> s.length() >= 2).limit(MAX_PARTS)
                .toList();
    }

    /** a number in words at the start of a part, in digits: what the matcher reads (« une pomme » → « 1 pomme ») */
    static String digits(String part) {
        String s = part.strip();
        java.util.regex.Matcher half = HALF.matcher(s);
        if (half.matches() && !half.group(1).isBlank()) {
            return "0.5 " + LEADING_ARTICLE.matcher(half.group(1)).replaceFirst("");
        }
        java.util.regex.Matcher quarter = QUARTER.matcher(s);
        if (quarter.matches() && !quarter.group(1).isBlank()) {
            return "0.25 " + LEADING_ARTICLE.matcher(quarter.group(1)).replaceFirst("");
        }
        int space = s.indexOf(' ');
        if (space > 0) {
            String first = s.substring(0, space).toLowerCase(java.util.Locale.ROOT);
            String n = NUMBERS.get(first);
            if (n != null) {
                return n + " " + s.substring(space + 1);
            }
        }
        return s;
    }

    /** the usual portion of a part said without a quantity: its own, else its group's, else 100 g */
    static double portion(String key, String category) {
        Double own = PORTIONS.get(key);
        if (own == null) {
            // « riz cantonais » is rice, « pâtes au pesto » pasta: the first word decides when the whole is unknown
            String head = key.contains(" ") ? key.substring(0, key.indexOf(' ')) : key;
            own = PORTIONS.get(head);
        }
        if (own != null) {
            return own;
        }
        return category == null ? 100 : BY_CATEGORY.getOrDefault(category, 100.0);
    }

    @SuppressWarnings("unchecked")
    private static <V> Map<String, V> keyed(Object... pairs) {
        Map<String, V> m = new HashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            m.put(IngredientMatcher.key((String) pairs[i]), (V) pairs[i + 1]);
        }
        return Map.copyOf(m);
    }
}
