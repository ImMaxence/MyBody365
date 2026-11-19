package fr.mbonnici.mybody365.nutrition;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The health score of MyBody365 (1.13), out of 10 by halves, in place of the Nutri-Score. The same rules as the app
 * (frontend core/meals/health.ts): change one, change both.
 *
 * <p>A food starts at 6. Sugars, saturated fat, salt, energy, ultra-processing (NOVA 4), frying, additives and sweeteners
 * take points away; fibre, protein, fruit / vegetables / legumes / nuts, a light food, a raw food (NOVA 1) and good fats
 * bring some back. An oil, a butter or a margarine is judged on the share of saturated fat in its fat (olive oil scores
 * well, butter badly), eaten by the spoonful. A drink other than milk starts at 10, water being the reference, and loses
 * points for its sugars, its energy and its sweeteners. Alcohol has no score.
 */
public final class HealthScore {

    /** what is known of a food, per 100 g (per 100 ml for a drink) */
    public record Input(Nutrients per100, boolean drink, boolean water, boolean alcohol, Integer nova, Integer additives, boolean sweeteners,
            Double fruitVeg, boolean fried) {}

    /** the score and its reasons, the weightiest first (codes the app words: fiber, protein… / sugars, satFat…) */
    public record Result(double score, List<String> pros, List<String> cons) {}

    /** Ciqual's groups made of plain fruit, vegetables, legumes and nuts */
    private static final Set<String> CIQUAL_FRUIT_VEG = Set.of("fruits", "légumes", "légumineuses", "fruits à coque et graines oléagineuses");
    /** Ciqual's groups of raw or barely processed foods (NOVA 1) */
    private static final Set<String> CIQUAL_RAW = Set.of("fruits", "légumes", "légumineuses", "fruits à coque et graines oléagineuses", "oeufs",
            "viandes crues", "viandes cuites", "poissons crus", "poissons cuits", "mollusques et crustacés crus", "mollusques et crustacés cuits",
            "laits", "herbes", "pâtes, riz et céréales", "pommes de terre et autres tubercules", "algues", "farines");
    /** Ciqual's groups of mostly industrial foods (NOVA 4) */
    private static final Set<String> CIQUAL_ULTRA = Set.of("biscuits sucrés", "biscuits apéritifs", "barres céréalières", "céréales de petit-déjeuner",
            "confiseries non chocolatées", "desserts glacés", "glaces", "charcuteries et alternatives végétales");
    /** Ciqual's groups of processed foods (NOVA 3) */
    private static final Set<String> CIQUAL_PROCESSED = Set.of("chocolats et produits à base de chocolat", "gâteaux et pâtisseries", "viennoiseries",
            "fromages et alternatives végétales", "pains et assimilés", "sandwichs", "pizzas, tartes et crêpes salées", "feuilletées et autres entrées",
            "pâtes à tarte", "confitures et assimilés");
    /** the food groups of Open Food Facts (PNNS) that are drinks other than milk */
    private static final Set<String> PNNS_DRINKS = Set.of("Sweetened beverages", "Unsweetened beverages", "Artificially sweetened beverages",
            "Fruit juices", "Fruit nectars", "Teas and herbal teas and coffees", "Waters and flavored waters", "Plant-based milk substitutes");
    private static final Set<String> PNNS_FRUIT_VEG = Set.of("Fruits", "Vegetables", "Legumes", "Nuts", "Dried fruits", "Fruit juices");

    private static final Pattern FRIED = Pattern.compile("\\b(frit|frits|frite|frites|chips|beignet|beignets|nugget|nuggets|pane|panes|panee|panees"
            + "|tempura|croquette|croquettes|friture|donut|donuts|churros|samoussa|samoussas|nem|nems|fried|fries|crisps)\\b");
    /** names of drinks that are liquid even without a group saying so */
    private static final Pattern LIQUID_NAME = Pattern.compile("^(lait|boisson|jus|soupe|veloute|bouillon|smoothie|milk ?shake|kefir|lassi|nectar|"
            + "eau|the|tisane|infusion|cafe|soda|limonade|sirop dilue|yaourt a boire|lait fermente)\\b");
    private static final Pattern NOT_LIQUID = Pattern.compile("\\b(glace|glaces|sorbet|sorbets|creme glacee|concentre|en poudre|poudre|soluble)\\b");

    private HealthScore() {}

    /** a Ciqual group of plain fruit, vegetables, legumes or nuts (their share of a recipe counts) */
    public static boolean fruitVegCategory(String category) {
        return category != null && CIQUAL_FRUIT_VEG.contains(category.strip().toLowerCase(Locale.ROOT));
    }

    /** a name that says the food was fried */
    public static boolean fried(String name) {
        return name != null && FRIED.matcher(SearchText.normalize(name)).find();
    }

    /** a food of the table: what its source tells of it */
    public static Input of(FoodStore.Food f) {
        return of(f.source(), f.name(), f.category(), f.per100(), f.info());
    }

    public static Input of(FoodStore.Source source, String name, String category, Nutrients n, ProductInfo info) {
        ProductInfo p = info == null ? ProductInfo.NONE : info;
        String cat = category == null ? "" : category.strip().toLowerCase(Locale.ROOT);
        boolean fried = fried(name);
        boolean low = n.kcal() < 1 && (n.sugarsG() == null || n.sugarsG() <= 0.5);
        if (source == FoodStore.Source.CIQUAL) {
            boolean alcohol = cat.equals("boisson alcoolisées") && !SearchText.normalize(name).contains("sans alcool");
            boolean water = cat.equals("eaux") && low;
            boolean drink = cat.equals("boissons sans alcool") || cat.equals("eaux");
            // spelled out: a ternary mixing 1 and null unboxes the null
            Integer nova = null;
            if (!fried && CIQUAL_RAW.contains(cat)) {
                nova = 1;
            } else if (CIQUAL_ULTRA.contains(cat)) {
                nova = 4;
            } else if (CIQUAL_PROCESSED.contains(cat)) {
                nova = 3;
            }
            return new Input(n, drink, water, alcohol, nova, null, false, CIQUAL_FRUIT_VEG.contains(cat) ? 100d : null, fried);
        }
        String pnns = p.pnns() == null ? "" : p.pnns();
        boolean alcohol = pnns.equals("Alcoholic beverages");
        boolean drink = PNNS_DRINKS.contains(pnns);
        boolean water = pnns.equals("Waters and flavored waters") && low;
        Double fruitVeg = p.fruitVeg() != null ? p.fruitVeg() : PNNS_FRUIT_VEG.contains(pnns) ? 100d : null;
        return new Input(n, drink, water, alcohol, p.nova(), p.additives(), p.sweeteners(), fruitVeg, fried);
    }

    /**
     * 1.13: a food best measured in millilitres (a glass, a cup, a mug): drinks, milks, soups, under 150 kcal per 100 g
     * (an oil or a cream stays in grams), and alcohol.
     */
    public static boolean liquid(FoodStore.Source source, String name, String category, Nutrients n, ProductInfo info) {
        Input in = of(source, name, category, n, info);
        if (in.alcohol()) {
            return true;
        }
        String plain = SearchText.normalize(name == null ? "" : name);
        if (n.kcal() >= 150 || NOT_LIQUID.matcher(plain).find()) {
            return false;
        }
        if (in.drink() || in.water()) {
            return true;
        }
        String cat = category == null ? "" : category.strip().toLowerCase(Locale.ROOT);
        if (source == FoodStore.Source.CIQUAL) {
            return Set.of("laits", "soupes", "laits et boissons infantiles").contains(cat);
        }
        ProductInfo p = info == null ? ProductInfo.NONE : info;
        if ("Ice cream".equals(p.pnns())) {
            return false;
        }
        return ProductInfo.millilitres(p.quantity()) != null || LIQUID_NAME.matcher(plain).find();
    }

    /** null when the sugars, the saturated fat or the salt are unknown (a portion noted with its calories only), or for alcohol */
    public static Result score(Input p) {
        if (p.alcohol()) {
            return null;
        }
        if (p.water()) {
            return new Result(10, List.of("water"), List.of());
        }
        Nutrients n = p.per100();
        if (n == null || n.sugarsG() == null || n.satFatG() == null || n.saltG() == null) {
            return null;
        }
        List<Object[]> pros = new ArrayList<>();
        List<Object[]> cons = new ArrayList<>();
        Integer nova = p.nova();
        double additives = above(p.additives() == null ? null : p.additives().doubleValue(), 1) * 0.25;
        if (additives > 0) {
            cons.add(new Object[] {"additives", Math.min(1, additives)});
        }
        if (nova != null && nova == 4) {
            cons.add(new Object[] {"ultra", 1.5});
        }
        double protein = n.proteinG() == null ? 0 : n.proteinG();
        double fiber = n.fiberG() == null ? 0 : n.fiberG();
        double base;
        if (p.drink()) {
            base = 10;
            cons.add(new Object[] {"sugars", Math.min(7, n.sugarsG() * 0.6)});
            cons.add(new Object[] {"energy", Math.min(2, above(n.kcal(), 5) * 0.04)});
            cons.add(new Object[] {"salt", Math.min(2, above(n.saltG(), 0.2) * 4)});
            cons.add(new Object[] {"satFat", Math.min(2, above(n.satFatG(), 0.5))});
            if (nova != null && nova == 3) {
                cons.add(new Object[] {"ultra", 0.5});
            }
            if (p.sweeteners()) {
                cons.add(new Object[] {"sweeteners", 2.5});
            }
            pros.add(new Object[] {"protein", Math.min(1, protein * 0.3)});
            pros.add(new Object[] {"fiber", Math.min(0.5, fiber * 0.3)});
            if (p.fruitVeg() != null && p.fruitVeg() >= 80) {
                pros.add(new Object[] {"fruitVeg", 1d});
            }
        } else {
            base = 6;
            double fat = n.fatG() == null ? 0 : n.fatG();
            double ratio = fat > 0 ? n.satFatG() / fat : 0;
            boolean fats = fat >= 50 && protein < 10 && (n.carbsG() == null ? 0 : n.carbsG()) < 15;
            cons.add(new Object[] {"sugars", Math.min(6, above(n.sugarsG(), 4) * 0.16)});
            cons.add(new Object[] {"salt", Math.min(4, above(n.saltG(), 0.25) * 1.6)});
            if (fats) {
                cons.add(new Object[] {"energy", 1d});
                cons.add(new Object[] {"satFat", clamp((ratio - 0.12) * 12, 0, 3.5)});
                if (ratio <= 0.2) {
                    pros.add(new Object[] {"goodFats", 3.5});
                } else if (ratio <= 0.3) {
                    pros.add(new Object[] {"goodFats", 1.5});
                }
            } else {
                cons.add(new Object[] {"energy", Math.min(2.8, above(n.kcal(), 100) * 0.007)});
                cons.add(new Object[] {"satFat", Math.min(3.5, above(n.satFatG(), 1) * 0.25)});
                // the oil of a fried food does not make it better
                if (fat >= 10 && ratio <= 0.2 && !p.fried()) {
                    pros.add(new Object[] {"goodFats", 1d});
                } else if (fat >= 10 && ratio <= 0.3 && !p.fried()) {
                    pros.add(new Object[] {"goodFats", 0.5});
                }
            }
            if (nova != null && nova == 3) {
                cons.add(new Object[] {"ultra", 0.5});
            }
            if (p.fried()) {
                cons.add(new Object[] {"fried", 1.5});
            }
            if (p.sweeteners()) {
                cons.add(new Object[] {"sweeteners", 0.5});
            }
            pros.add(new Object[] {"fiber", Math.min(2.5, fiber * 0.35)});
            pros.add(new Object[] {"protein", Math.min(3, protein * 0.13)});
            double fv = p.fruitVeg() == null ? 0 : p.fruitVeg();
            pros.add(new Object[] {"fruitVeg", fv > 80 ? 3 : fv > 60 ? 1.5 : fv > 40 ? 0.5 : 0d});
            pros.add(new Object[] {"light", n.kcal() < 60 ? 1.5 : n.kcal() < 100 ? 0.75 : 0d});
            if (nova != null && nova == 1 && !p.fried()) {
                pros.add(new Object[] {"raw", 1d});
            }
        }
        double minus = cons.stream().mapToDouble(c -> (double) c[1]).sum();
        double plus = pros.stream().mapToDouble(c -> (double) c[1]).sum();
        double score = Math.round(clamp(base - minus + plus, 0, 10) * 2) / 2.0;
        // said only when true by the usual claims (« riche en fibres » from 6 g, « riche en protéines » from 20 % of the
        // energy), and never for a food that scores low
        List<String> said = score < 3.5 ? List.of() : merge(pros).stream().filter(k -> switch (k) {
            case "fiber" -> fiber >= (p.drink() ? 1.5 : 6);
            case "protein" -> protein >= (p.drink() ? 2.5 : 5) && protein * 4 >= n.kcal() * 0.2;
            default -> true;
        }).toList();
        return new Result(score, said, merge(cons));
    }

    /** the reasons worth saying (half a point or more), the weightiest first, each once */
    private static List<String> merge(List<Object[]> list) {
        Map<String, Double> sum = new LinkedHashMap<>();
        for (Object[] c : list) {
            sum.merge((String) c[0], (Double) c[1], Double::sum);
        }
        return sum.entrySet().stream().filter(e -> e.getValue() >= 0.5).sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .map(Map.Entry::getKey).toList();
    }

    private static double above(Double v, double from) {
        return Math.max(0, (v == null ? 0 : v) - from);
    }

    private static double clamp(double v, double lo, double hi) {
        return Math.min(hi, Math.max(lo, v));
    }

    /** the old Nutri-Score letters of meals noted before 1.13, read as a score */
    public static Double fromGrade(String grade) {
        if (grade == null) {
            return null;
        }
        return switch (grade.toLowerCase(Locale.ROOT)) {
            case "a" -> 9d;
            case "b" -> 7d;
            case "c" -> 5d;
            case "d" -> 3d;
            case "e" -> 1d;
            default -> null;
        };
    }
}
