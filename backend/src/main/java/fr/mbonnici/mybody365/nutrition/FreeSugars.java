package fr.mbonnici.mybody365.nutrition;

import fr.mbonnici.mybody365.nutrition.FoodStore.Food;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 1.20: the free sugars of a food (the WHO's: those added by the maker, the cook or the eater, plus those of honey, syrups and
 * fruit juices), estimated from what the food is, since the tables give only the total sugars. Not free: the sugars of whole
 * fruit (fresh or dried), vegetables, pulses, nuts, plain milk and plain yoghurt; dairy keeps its lactose (about 4.7 g per
 * 100 g) out. Savoury mixed dishes count half (their sugars are mostly the vegetables', some the sauce's, and there is no
 * recipe to tell). Anything else counts as free: the estimate errs on the side of too much, never of too little.
 */
public final class FreeSugars {

    private FreeSugars() {}

    /** the lactose of milk, yoghurt and their desserts, per 100 g */
    static final double LACTOSE = 4.7;

    /** Ciqual groups whose sugars are the food's own */
    private static final Set<String> OWN = Set.of("légumes", "légumineuses", "pommes de terre et autres tubercules",
            "fruits à coque et graines oléagineuses", "viandes crues", "viandes cuites", "poissons crus", "poissons cuits",
            "mollusques et crustacés crus", "mollusques et crustacés cuits", "oeufs", "fromages et alternatives végétales",
            "pâtes, riz et céréales", "farines", "huiles et graisses végétales", "beurres", "margarines", "autres matières grasses",
            "huiles de poissons", "herbes", "épices", "sels", "algues", "eaux", "crèmes et spécialités à base de crème");
    /** Ciqual groups of milk and its desserts: all but the lactose */
    private static final Set<String> DAIRY = Set.of("laits", "produits laitiers frais et alternatives végétales", "laits et boissons infantiles",
            "glaces", "desserts glacés");
    /** Ciqual groups of savoury mixed dishes: half */
    private static final Set<String> MIXED = Set.of("plats composés", "sandwichs", "soupes", "pizzas, tartes et crêpes salées",
            "salades composées et crudités", "feuilletées et autres entrées", "petits pots salés et plats infantiles", "pains et assimilés",
            "ingrédients pour végétariens", "tartinables végétariens", "produits à base de poissons et produits de la mer",
            "autres produits à base de viande");

    /** Open Food Facts groups (pnns_groups_2) whose sugars are the food's own */
    private static final Set<String> OWN_OFF = Set.of("Fruits", "Dried fruits", "Vegetables", "Legumes", "Nuts", "Cheese", "Meat", "Fish and seafood",
            "Eggs", "Offals", "Potatoes", "Cereals", "Fats", "Unsweetened beverages", "Waters and flavored waters", "Teas and herbal teas and coffees");
    private static final Set<String> DAIRY_OFF = Set.of("Milk and yogurt", "Dairy desserts", "Ice cream", "Baby milks");
    private static final Set<String> MIXED_OFF = Set.of("One-dish meals", "Sandwiches", "Pizza pies and quiches", "Soups", "Bread", "Processed meat");

    /** a fruit made sweet, pressed or mashed: its sugars count (syrups, compotes, juices, candied, sweetened dried fruit) */
    private static final Pattern FRUIT_FREE = Pattern.compile("\\b(sirop|compote|confit|confite|sucre|sucree|jus|nectar|puree|smoothie|dessert de fruits)\\b");
    /** sweetened, flavoured, with fruit: a dairy or a drink with sugar added */
    private static final Pattern SWEETENED = Pattern.compile("\\b(sucre|sucree|sucres|aromatise|aromatisee|aux fruits|vanille|chocolat|caramel|miel|sirop)\\b");
    private static final Pattern PLAIN = Pattern.compile("\\bnature\\b");
    private static final Pattern PLANT = Pattern.compile("\\b(soja|vegetal|vegetale|amande|avoine|coco|riz|noisette)\\b");
    private static final Pattern MILKY = Pattern.compile("\\b(lait|latte|cappuccino|au lait)\\b");
    private static final Pattern BREWED = Pattern.compile("\\b(cafe|the|tisane|infusion|expresso|espresso)\\b");
    /**
     * a product with no group: a name that starts with a plain food tells its own sugars (« Lentilles corail », « Noisettes
     * grillées »), unless a sweet word follows (« Pâte à tartiner noisettes » does not start so, « Amandes au chocolat » has one)
     */
    private static final Pattern OWN_START = Pattern.compile("^(legumes?|salade|tomates?|carottes?|courgettes?|haricots?|lentilles?|pois chiches|petits pois"
            + "|pommes? de terre|riz|pates|quinoa|semoule|boulgour|oeufs?|poulet|boeuf|porc|jambon|poissons?|saumon|thon|cabillaud|fromage|emmental|comte"
            + "|mozzarella|noix|amandes?|noisettes?|cacahuetes?|eau|cafe|huile|beurre)\\b");
    private static final Pattern SWEET_WORDS = Pattern.compile("\\b(sucre|sucree|sucres|chocolat|caramel|caramelise|miel|sirop|tartiner|biscuits?|gateaux?"
            + "|cookies?|confiture|bonbons?|praline|nougat|glace|dessert|creme|patisserie|brioche|cereales|barres?|aromatise|aromatisee|aux fruits|vanille"
            + "|candy|sweet|cake)\\b");
    private static final Pattern DAIRY_START = Pattern.compile("^(lait|yaourts?|yogourts?|skyr|fromage blanc|petits? suisses?|kefir)\\b");

    /** the free sugars of an amount (grams) of a food; null when its sugars are not known */
    public static Double of(Food f, double grams) {
        Double sugars = f.per100().sugarsG();
        if (sugars == null) {
            return null;
        }
        return round(per100(f.source(), f.category(), f.name(), f.info() == null ? null : f.info().pnns(), sugars) * grams / 100);
    }

    /** the free sugars in 100 g of a food, from its sugars per 100 g */
    public static double per100(FoodStore.Source source, String category, String name, String pnns, double sugars) {
        String n = SearchText.normalize(name);
        if (source == FoodStore.Source.CIQUAL && category != null) {
            String c = category.toLowerCase(java.util.Locale.ROOT);
            if (OWN.contains(c)) {
                return 0;
            }
            if (c.equals("fruits")) {
                return FRUIT_FREE.matcher(n).find() ? sugars : 0;
            }
            if (DAIRY.contains(c)) {
                return dairy(n, sugars);
            }
            if (c.equals("boissons sans alcool")) {
                return drink(n, sugars);
            }
            if (MIXED.contains(c)) {
                return sugars / 2;
            }
            return sugars;
        }
        if (source == FoodStore.Source.OFF && pnns != null && !pnns.isBlank()) {
            if (OWN_OFF.contains(pnns)) {
                // a sweetened tea or a flavoured water slips into these groups: its name tells
                return SWEETENED.matcher(n).find() && !PLAIN.matcher(n).find() ? sugars : 0;
            }
            if (DAIRY_OFF.contains(pnns)) {
                return dairy(n, sugars);
            }
            if ("Plant-based milk substitutes".equals(pnns)) {
                return PLAIN.matcher(n).find() && !SWEETENED.matcher(n).find() ? 0 : sugars;
            }
            if (MIXED_OFF.contains(pnns)) {
                return sugars / 2;
            }
            return sugars;
        }
        // a product with no group, a food of the member's: what its name starts with, else all of it
        if (DAIRY_START.matcher(n).find()) {
            return dairy(n, sugars);
        }
        if (OWN_START.matcher(n).find() && !SWEET_WORDS.matcher(n).find()) {
            return 0;
        }
        return sugars;
    }

    /** milk, yoghurt and their desserts: plain, only lactose; else what is above it (a plant one has no lactose) */
    private static double dairy(String n, double sugars) {
        boolean plant = PLANT.matcher(n).find() && !n.contains("lait de vache");
        if (PLAIN.matcher(n).find() && !SWEETENED.matcher(n).find()) {
            return plant ? 0 : Math.max(0, sugars - LACTOSE);
        }
        return plant ? sugars : Math.max(0, sugars - LACTOSE);
    }

    /** juices, sodas and syrups: all; coffee and tea without sugar: none; a drink made with milk: all but the lactose */
    private static double drink(String n, double sugars) {
        if (BREWED.matcher(n).find() && !SWEETENED.matcher(n).find() && !MILKY.matcher(n).find()) {
            return 0;
        }
        if (MILKY.matcher(n).find() && !PLANT.matcher(n).find()) {
            return Math.max(0, sugars - LACTOSE);
        }
        if (PLANT.matcher(n).find() && PLAIN.matcher(n).find() && !SWEETENED.matcher(n).find()) {
            return 0;
        }
        return sugars;
    }

    private static double round(double v) {
        return Math.round(v * 10) / 10.0;
    }
}
