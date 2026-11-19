package fr.mbonnici.mybody365.shopping;

import fr.mbonnici.mybody365.nutrition.SearchText;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * The aisles of a French supermarket, in the order they are walked (1.11): fruits and vegetables at the entrance, the
 * frozen food last so that it stays cold. A food goes to its aisle by its Ciqual category; a product of Open Food Facts
 * or a food of one's own (no category) by the words of its name.
 */
public enum Aisle {
    FRUITS_VEGETABLES, BAKERY, BUTCHER, FISHMONGER, DELI, CHEESE, DAIRY, SAVORY, SWEET, DRINKS, FROZEN, OTHER;

    private static final Pattern FROZEN_WORDS = Pattern.compile("\\b(surgele|surgeles|surgelee|surgelees|glace|glaces|sorbet|sorbets|glacon|glacons)\\b");
    private static final Pattern TINNED = Pattern.compile("\\b(appertise|appertisee|appertises|appertisees|conserve|saumure|bocal)\\b");
    private static final Pattern SYRUP = Pattern.compile("\\b(sirop|compote)\\b");
    private static final Pattern DRIED = Pattern.compile("\\b(sec|seche|secs|seches|sechee|sechees|deshydrate|deshydratee|poudre)\\b");
    private static final Pattern FRESH = Pattern.compile("\\b(frais|fraiche|fraiches)\\b");

    /** Ciqual categories (as SearchText writes them), the first that starts the category wins */
    private static final List<Map.Entry<String, Aisle>> CATEGORIES = List.of(
            Map.entry("glaces", FROZEN), Map.entry("sorbets", FROZEN), Map.entry("desserts glaces", FROZEN),
            Map.entry("eaux", DRINKS), Map.entry("boisson", DRINKS),
            Map.entry("legumes", FRUITS_VEGETABLES), Map.entry("fruits a coque", SAVORY), Map.entry("fruits", FRUITS_VEGETABLES),
            Map.entry("pommes de terre", FRUITS_VEGETABLES), Map.entry("herbes", FRUITS_VEGETABLES),
            Map.entry("pains", BAKERY), Map.entry("viennoiseries", BAKERY),
            Map.entry("viandes", BUTCHER), Map.entry("autres produits a base de viande", BUTCHER),
            Map.entry("poissons", FISHMONGER), Map.entry("mollusques", FISHMONGER), Map.entry("produits a base de poissons", FISHMONGER),
            Map.entry("charcuteries", DELI), Map.entry("plats composes", DELI), Map.entry("salades composees", DELI),
            Map.entry("sandwichs", DELI), Map.entry("pizzas", DELI), Map.entry("feuilletees", DELI), Map.entry("soupes", DELI),
            Map.entry("ingredients pour vegetariens", DELI), Map.entry("tartinables vegetariens", DELI), Map.entry("petits pots", DELI),
            Map.entry("fromages", CHEESE),
            Map.entry("laits", DAIRY), Map.entry("oeufs", DAIRY), Map.entry("beurres", DAIRY), Map.entry("cremes", DAIRY),
            Map.entry("produits laitiers", DAIRY), Map.entry("margarines", DAIRY), Map.entry("pates a tarte", DAIRY),
            Map.entry("desserts", DAIRY),
            Map.entry("pates riz", SAVORY), Map.entry("farines", SAVORY), Map.entry("legumineuses", SAVORY), Map.entry("huiles", SAVORY),
            Map.entry("sauces", SAVORY), Map.entry("condiments", SAVORY), Map.entry("aides culinaires", SAVORY), Map.entry("epices", SAVORY),
            Map.entry("sels", SAVORY), Map.entry("biscuits aperitifs", SAVORY), Map.entry("algues", SAVORY),
            Map.entry("autres matieres grasses", SAVORY),
            Map.entry("sucres", SWEET), Map.entry("chocolats", SWEET), Map.entry("confitures", SWEET), Map.entry("biscuits", SWEET),
            Map.entry("cereales", SWEET), Map.entry("confiseries", SWEET), Map.entry("gateaux", SWEET), Map.entry("barres", SWEET));

    /** words of a name, for a food with no category (Open Food Facts, one's own, a line typed by hand) */
    private static final List<Map.Entry<Pattern, Aisle>> WORDS = List.of(
            Map.entry(words("eau|jus|soda|cola|limonade|sirop|biere|vin|cidre|champagne|whisky|vodka|rhum|the glace|boisson"), DRINKS),
            Map.entry(words("yaourt|yaourts|yogourt|skyr|lait|beurre|creme|oeuf|oeufs|fromage blanc|petit suisse|faisselle|pate brisee|pate feuilletee|pate sablee|pate a pizza"), DAIRY),
            Map.entry(words("fromage|fromages|emmental|comte|mozzarella|parmesan|chevre|feta|camembert|brie|raclette|reblochon|cheddar|gruyere|roquefort"), CHEESE),
            Map.entry(words("jambon|saucisson|saucisse|saucisses|lardons|lardon|bacon|chorizo|pate|rillettes|knacks|salami|traiteur|quiche|pizza|taboule|houmous|tofu"), DELI),
            Map.entry(words("poulet|dinde|boeuf|veau|porc|agneau|canard|lapin|steak|steaks|viande|escalope|escalopes|cote|cotes|roti|merguez|filet mignon"), BUTCHER),
            Map.entry(words("saumon|thon|cabillaud|colin|crevette|crevettes|moules|poisson|poissons|truite|sardine|sardines|maquereau|surimi"), FISHMONGER),
            Map.entry(words("pain|pains|baguette|brioche|croissant|croissants|viennoiserie|viennoiseries|tortilla|tortillas"), BAKERY),
            Map.entry(words("pomme|pommes|poire|poires|banane|bananes|tomate|tomates|salade|carotte|carottes|courgette|courgettes|oignon|oignons|ail|citron|citrons|orange|oranges|fraise|fraises|legume|legumes|fruit|fruits|avocat|avocats|poivron|poivrons|concombre|champignon|champignons|pomme de terre|pommes de terre|persil|basilic|herbes"), FRUITS_VEGETABLES),
            Map.entry(words("chocolat|biscuit|biscuits|gateau|gateaux|sucre|confiture|miel|cereales|bonbon|bonbons|compote|cookies|pate a tartiner"), SWEET),
            Map.entry(words("pates|riz|farine|huile|vinaigre|sel|poivre|epice|epices|sauce|ketchup|mayonnaise|moutarde|conserve|lentilles|haricots|semoule|quinoa|bouillon|chips|olives"), SAVORY));

    private static Pattern words(String alternatives) {
        return Pattern.compile("\\b(" + alternatives + ")\\b");
    }

    /** « Œufs » as « Oeufs »: search texts write the ligature as a plain o, which would read « oufs » */
    static String ligatures(String s) {
        return s == null ? null : s.replace("œ", "oe").replace("Œ", "Oe").replace("æ", "ae").replace("Æ", "Ae");
    }

    /** the aisle of a food: its category first, then the words of its name; OTHER when nothing tells */
    public static Aisle of(String name, String category) {
        // « Œufs » is « oeufs » here (search texts write the ligature as a plain o)
        String n = SearchText.normalize(ligatures(name));
        String c = SearchText.normalize(ligatures(category));
        if (FROZEN_WORDS.matcher(n).find()) {
            return FROZEN;
        }
        if (!c.isEmpty()) {
            boolean fruit = c.startsWith("fruits") && !c.startsWith("fruits a coque");
            if (c.startsWith("legumes") || fruit || c.startsWith("pommes de terre") || c.startsWith("herbes")) {
                // tinned, dried or in syrup: the aisles of the grocery, not the stalls
                if (fruit && (SYRUP.matcher(n).find() || DRIED.matcher(n).find())) {
                    return SWEET;
                }
                if (TINNED.matcher(n).find() || (DRIED.matcher(n).find() && !FRESH.matcher(n).find())) {
                    return SAVORY;
                }
                return FRUITS_VEGETABLES;
            }
            if ((c.startsWith("produits a base de poissons") || c.startsWith("charcuteries")) && TINNED.matcher(n).find()) {
                return SAVORY;
            }
            if (c.startsWith("pains") && n.matches("^(chapelure|biscotte|pain grille|petit pain grille).*")) {
                return SAVORY;
            }
            for (Map.Entry<String, Aisle> e : CATEGORIES) {
                if (c.startsWith(e.getKey())) {
                    return e.getValue();
                }
            }
        }
        for (Map.Entry<Pattern, Aisle> e : WORDS) {
            if (e.getKey().matcher(n).find()) {
                return e.getValue();
            }
        }
        return OTHER;
    }
}
