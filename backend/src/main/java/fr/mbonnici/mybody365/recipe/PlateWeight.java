package fr.mbonnici.mybody365.recipe;

import fr.mbonnici.mybody365.nutrition.SearchText;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 1.18: what a serving of a recipe weighs on the plate, cooked, so that « 412 kcal la part » says how big a part is. The
 * ingredients are weighed raw (dry pasta, raw meat, the water of the pot); cooking changes that:
 * <ul>
 * <li>the dry starches take in water: pasta ×2.3, rice ×2.6, quinoa ×2.8, semolina and couscous ×2.3, bulgur and the
 * other grains ×2.6, polenta ×4, dried pulses ×2.6 (Ciqual's raw and cooked values of the same food). That water comes
 * from the liquids the recipe lists first, then from the pot;</li>
 * <li>raw meat loses about 28 % of its weight, fish and seafood 20 %, raw vegetables 12 %, raw potatoes 10 % (none of it in
 * a dish eaten raw: a salad, a tartare, a bowl);</li>
 * <li>the liquids left (water, broth, wine, milk) stay in a soup or a porridge (−8 %), reduce by about half in a dish
 * that simmers, stay in a batter;</li>
 * <li>a cake, a tart, a bread loses about 12 % in the oven.</li>
 * </ul>
 * Tried on the 729 recipes of the community: a bourguignon ≈ 380 g a serving, pasta with pesto ≈ 310 g, a vegetable soup ≈
 * 430 g, a yoghurt cake ≈ 90 g. An estimate, said so in the app (± 20 %). None for a recipe entered with its calories only.
 */
public final class PlateWeight {

    private static final Logger log = LoggerFactory.getLogger(PlateWeight.class);

    /** the rules: a new value recomputes every recipe at the next start */
    public static final String RULES = "1";
    static final String STATE_KEY = "plate_rules";

    public record Line(String name, String category, double grams) {}

    private static final Pattern RAW_FOOD = Pattern.compile("\\bcru");
    private static final Pattern DRY = Pattern.compile("\\b(cru|crue|crus|crues|sec|seche|secs|seches|a cuire|deshydrate|deshydratee)\\b");
    private static final Pattern RAW_DISH = Pattern.compile(
            "salade|taboule|crudite|carpaccio|tartare|ceviche|poke|smoothie|\\bjus\\b|gaspacho|bowl|verrine|overnight|bircher|muesli|sandwich|wrap|"
                    + "tartine|bruschetta|houmous|guacamole|\\bdip\\b|milkshake|lassi|granola");
    private static final Pattern BAKED = Pattern.compile(
            "gateau|\\bcake|tarte|quiche|\\bpain|brioche|cookie|muffin|madeleine|financier|biscuit|crepe|gaufre|\\bflan\\b|clafoutis|fondant|"
                    + "brownie|moelleux|cannele|chouquette|eclair|paris brest|mille feuille|galette des rois|kouign|croissant|marbre|buche|fraisier|"
                    + "cheesecake|pancake|\\bfar\\b|sable|meringue|pizza|cake");
    /** what keeps its liquid: a soup, a porridge, a milk pudding */
    private static final Pattern WET = Pattern.compile(
            "soupe|veloute|potage|bouillon|minestrone|creme de|bisque|\\bpho\\b|ramen|harira|chorba|porridge|riz au lait|semoule au lait|pudding|"
                    + "\\bchia\\b|chocolat chaud|\\blatte\\b|cafe|\\bthe\\b|infusion");

    private PlateWeight() {}

    /** grams of a cooked serving, rounded to 10 g; null when nothing is known of the ingredients */
    public static Double perServing(String recipeName, List<Line> lines, int servings) {
        if (lines == null || lines.isEmpty() || servings <= 0) {
            return null;
        }
        String dish = SearchText.normalize(recipeName);
        boolean raw = RAW_DISH.matcher(dish).find() && !WET.matcher(dish).find();
        boolean wet = WET.matcher(dish).find();
        boolean baked = !raw && !wet && BAKED.matcher(dish).find();
        double absorbed = 0;
        double liquids = 0;
        double total = 0;
        for (Line l : lines) {
            if (l.grams() <= 0) {
                continue;
            }
            String n = SearchText.normalize(l.name());
            String cat = l.category() == null ? "" : l.category();
            double swell = swell(n, cat);
            if (swell > 0) {
                total += l.grams();
                absorbed += (swell - 1) * l.grams();
                continue;
            }
            if (liquid(n, cat)) {
                liquids += l.grams();
                continue;
            }
            double k = 1;
            if (!raw && !baked) {
                boolean rawFood = RAW_FOOD.matcher(n).find();
                if (cat.equals("viandes crues")) {
                    k = 0.72;
                } else if (cat.equals("poissons crus") || cat.equals("mollusques et crustacés crus")) {
                    k = 0.8;
                } else if (cat.equals("légumes") && rawFood) {
                    k = 0.88;
                } else if (cat.equals("pommes de terre et autres tubercules") && rawFood) {
                    k = 0.9;
                }
            }
            total += l.grams() * k;
        }
        // the starches take in their water: from the liquids listed first (they are then in the dish), then from the pot
        double fromList = Math.min(absorbed, liquids);
        double rest = liquids - fromList;
        total += absorbed;
        total += raw || baked ? rest : wet ? rest * 0.92 : rest * 0.55;
        if (baked) {
            total *= 0.88;
        }
        double g = total / servings;
        return g < 5 ? null : Math.max(10, Math.round(g / 10) * 10.0);
    }

    /** how much a dry starch weighs once cooked in water, by gram (0: not one) */
    static double swell(String n, String cat) {
        if (!DRY.matcher(n).find()) {
            return 0;
        }
        if (cat.equals("pâtes, riz et céréales")) {
            if (n.matches("^(pates|vermicelle|nouille|lasagne|spaghetti|tagliatelle|macaroni|coquillette|penne).*")) {
                return 2.3;
            }
            if (n.startsWith("riz")) {
                return 2.6;
            }
            if (n.startsWith("quinoa")) {
                return 2.8;
            }
            if (n.startsWith("polenta") || n.contains("semoule de mais")) {
                return 4;
            }
            if (n.startsWith("semoule") || n.contains("couscous")) {
                return 2.3;
            }
            if (n.matches("^(boulgour|ble|sarrasin|millet|orge|epeautre|petit epeautre).*")) {
                return 2.6;
            }
            return 0;
        }
        return cat.equals("légumineuses") ? 2.6 : 0;
    }

    /** water, a ready broth, milk, wine or beer: what a pot gives to the starches or reduces */
    static boolean liquid(String n, String cat) {
        if (cat.equals("eaux")) {
            return true;
        }
        if (n.startsWith("bouillon") && !n.contains("deshydrat")) {
            return true;
        }
        if (cat.equals("laits") && !n.contains("poudre") && !n.contains("concentre")) {
            return true;
        }
        return cat.equals("boisson alcoolisées");
    }

    /**
     * Fills the recipes without a plate weight (or all of them when the rules changed): at start, and after a backup brings
     * recipes back. The ingredients are read with their food's name and group (a food deleted since: its line's name).
     */
    public static int fill(JdbcTemplate jdbc, boolean all) {
        Map<UUID, String> names = new LinkedHashMap<>();
        Map<UUID, Integer> servings = new LinkedHashMap<>();
        Map<UUID, List<Line>> lines = new LinkedHashMap<>();
        jdbc.query("""
                select r.id, r.name as recipe_name, r.servings, coalesce(f.name, ri.name) as name, f.category, ri.grams
                from recipe r join recipe_ingredient ri on ri.recipe_id = r.id left join food f on f.id = ri.food_id
                where not coalesce(r.manual_nutrition, false)""" + (all ? "" : " and r.plate_g is null") + " order by r.id, ri.position", rs -> {
            UUID id = rs.getObject("id", UUID.class);
            names.putIfAbsent(id, rs.getString("recipe_name"));
            servings.putIfAbsent(id, rs.getInt("servings"));
            lines.computeIfAbsent(id, k -> new ArrayList<>()).add(new Line(rs.getString("name"), rs.getString("category"), rs.getDouble("grams")));
        });
        List<Object[]> updates = new ArrayList<>();
        for (Map.Entry<UUID, List<Line>> e : lines.entrySet()) {
            updates.add(new Object[] {perServing(names.get(e.getKey()), e.getValue(), servings.get(e.getKey())), e.getKey()});
        }
        if (!updates.isEmpty()) {
            jdbc.batchUpdate("update recipe set plate_g = ? where id = ?", updates);
            log.info("Plate weight of {} recipes estimated", updates.size());
        }
        return updates.size();
    }
}
