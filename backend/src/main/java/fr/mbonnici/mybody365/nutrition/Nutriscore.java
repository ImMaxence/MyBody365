package fr.mbonnici.mybody365.nutrition;

/**
 * Nutri-Score estimated from the nutrients per 100 g, with the 2023 algorithm for general foods.
 * The share of fruit, vegetables and legumes is known for Ciqual's plain fruits, vegetables and legumes
 * (100 %); elsewhere it counts as 0, so the estimate errs on the strict side. Open Food Facts products keep
 * their official grade.
 */
public final class Nutriscore {

    private static final double[] ENERGY_KJ = {335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350};
    private static final double[] SUGARS = {3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34, 37, 41, 44, 48, 51};
    private static final double[] SAT_FAT = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
    private static final double[] SALT = {0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3, 3.2, 3.4, 3.6, 3.8, 4};
    private static final double[] FIBER = {3.0, 4.1, 5.2, 6.3, 7.4};
    private static final double[] PROTEIN = {2.4, 4.8, 7.2, 9.6, 12, 14, 17};

    /** Ciqual's plain fruits, vegetables and legumes: what counts as fruit and vegetables in a recipe (not potatoes nor nuts) */
    private static final java.util.Set<String> FRUIT_VEG = java.util.Set.of("fruits", "légumes", "légumineuses");

    private Nutriscore() {}

    /** a food of this category counts as fruit, vegetables or legumes (for the share of a recipe) */
    public static boolean fruitVeg(String category) {
        return category != null && FRUIT_VEG.contains(category.strip().toLowerCase(java.util.Locale.ROOT));
    }

    /** a–e, or null when the nutrients needed are missing */
    public static String grade(Nutrients per100) {
        return grade(per100, 0);
    }

    /** @param fruitVegPct share of fruit, vegetables and legumes, in % */
    public static String grade(Nutrients per100, double fruitVegPct) {
        if (per100 == null || per100.sugarsG() == null || per100.satFatG() == null || per100.saltG() == null) {
            return null;
        }
        int negative = points(per100.kcal() * 4.184, ENERGY_KJ) + points(per100.sugarsG(), SUGARS) + points(per100.satFatG(), SAT_FAT)
                + points(per100.saltG(), SALT);
        int fiber = per100.fiberG() == null ? 0 : points(per100.fiberG(), FIBER);
        int protein = per100.proteinG() == null ? 0 : points(per100.proteinG(), PROTEIN);
        int fruit = fruitVegPct > 80 ? 5 : fruitVegPct > 60 ? 2 : fruitVegPct > 40 ? 1 : 0;
        // above 11 negative points, proteins no longer make up for the rest (unless it is nearly all fruit and vegetables)
        int positive = negative >= 11 && fruit < 5 ? fiber + fruit : fiber + protein + fruit;
        int score = negative - positive;
        if (score <= 0) {
            return "a";
        }
        if (score <= 2) {
            return "b";
        }
        if (score <= 10) {
            return "c";
        }
        return score <= 18 ? "d" : "e";
    }

    /** one point per threshold strictly exceeded */
    static int points(double value, double[] thresholds) {
        int p = 0;
        for (double t : thresholds) {
            if (value > t) {
                p++;
            }
        }
        return p;
    }
}
