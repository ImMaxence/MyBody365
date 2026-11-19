package fr.mbonnici.mybody365.nutrition;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 1.14: the vitamins and minerals the app follows, per 100 g of a food (per serving of a recipe, per line of a meal):
 * their keys, their Ciqual constituent codes, their units and the European reference intakes of the labels (NRV,
 * regulation 1169/2011, annex XIII). Kept in the database as a small JSON object of the keys known.
 */
public final class Micros {

    /** a vitamin or a mineral: its key, its Ciqual constituent, its unit, its daily reference, its Open Food Facts column */
    public record Micro(String key, String ciqual, String unit, double nrv, String offColumn, double offFactor) {}

    /** Open Food Facts gives every value in grams: × 1 000 for mg, × 1 000 000 for µg */
    public static final List<Micro> ALL = List.of(
            new Micro("a", "51104", "µg", 800, "vitamin-a_100g", 1e6),
            new Micro("d", "52100", "µg", 5, "vitamin-d_100g", 1e6),
            new Micro("e", "53100", "mg", 12, "vitamin-e_100g", 1e3),
            new Micro("c", "55100", "mg", 80, "vitamin-c_100g", 1e3),
            new Micro("b1", "56100", "mg", 1.1, "vitamin-b1_100g", 1e3),
            new Micro("b2", "56200", "mg", 1.4, "vitamin-b2_100g", 1e3),
            new Micro("b6", "56500", "mg", 1.4, "vitamin-b6_100g", 1e3),
            new Micro("b9", "56700", "µg", 200, "vitamin-b9_100g", 1e6),
            new Micro("b12", "56600", "µg", 2.5, "vitamin-b12_100g", 1e6),
            new Micro("ca", "10200", "mg", 800, "calcium_100g", 1e3),
            new Micro("fe", "10260", "mg", 14, "iron_100g", 1e3),
            new Micro("mg", "10120", "mg", 375, "magnesium_100g", 1e3),
            new Micro("k", "10190", "mg", 2000, "potassium_100g", 1e3),
            new Micro("zn", "10300", "mg", 10, "zinc_100g", 1e3));

    private static final Map<String, Micro> BY_KEY = new LinkedHashMap<>();

    static {
        for (Micro m : ALL) {
            BY_KEY.put(m.key(), m);
        }
    }

    private Micros() {}

    public static Micro of(String key) {
        return BY_KEY.get(key);
    }

    /** {"a":12.5,"c":3} → its values (an unknown key or a broken text: left out) */
    public static Map<String, Double> parse(String json) {
        Map<String, Double> out = new LinkedHashMap<>();
        if (json == null || json.isBlank()) {
            return out;
        }
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"([a-z0-9]+)\"\\s*:\\s*(-?[0-9.eE+-]+)").matcher(json);
        while (m.find()) {
            if (BY_KEY.containsKey(m.group(1))) {
                try {
                    double v = Double.parseDouble(m.group(2));
                    if (Double.isFinite(v) && v >= 0) {
                        out.put(m.group(1), v);
                    }
                } catch (NumberFormatException e) {
                    // left out
                }
            }
        }
        return out;
    }

    /** its values as the JSON the database keeps (null when none is known) */
    public static String json(Map<String, Double> values) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        StringBuilder b = new StringBuilder("{");
        for (Micro m : ALL) {
            Double v = values.get(m.key());
            if (v != null && Double.isFinite(v) && v >= 0) {
                if (b.length() > 1) {
                    b.append(',');
                }
                b.append('"').append(m.key()).append("\":").append(String.format(Locale.ROOT, "%.4g", v));
            }
        }
        return b.length() == 1 ? null : b.append('}').toString();
    }

    /** every value × f */
    public static Map<String, Double> times(Map<String, Double> values, double f) {
        Map<String, Double> out = new LinkedHashMap<>();
        values.forEach((k, v) -> out.put(k, v * f));
        return out;
    }

    /** adds b into a (a value known in one only counts as it is) */
    public static void add(Map<String, Double> into, Map<String, Double> b) {
        b.forEach((k, v) -> into.merge(k, v, Double::sum));
    }

    /**
     * 1.14: the vitamins and minerals of a mix (the ingredients of a recipe): summed, each one kept only when it is known
     * for half of the calories at least. A value missing from the tables is unknown, not none: a stew whose only known
     * vitamin E comes from its pinch of parsley does not say « 0 % of vitamin E ».
     */
    public static final class Mix {
        private final Map<String, Double> sum = new LinkedHashMap<>();
        private final Map<String, Double> known = new java.util.HashMap<>();
        private double kcal;

        /** a part: its values per 100 g, its weight, its calories */
        public void add(Map<String, Double> per100, double grams, double partKcal) {
            double k = Math.max(0, partKcal);
            kcal += k;
            Micros.add(sum, times(per100, grams / 100));
            for (String key : per100.keySet()) {
                known.merge(key, k, Double::sum);
            }
        }

        /** the values known for half of the calories at least (all of them for a mix without calories), × f */
        public Map<String, Double> known(double f) {
            Map<String, Double> out = new LinkedHashMap<>();
            sum.forEach((key, v) -> {
                if (kcal <= 0 || known.getOrDefault(key, 0d) / kcal >= 0.5) {
                    out.put(key, v * f);
                }
            });
            return out;
        }
    }

    /** to show: 3 significant digits at most */
    public static Map<String, Double> rounded(Map<String, Double> values) {
        Map<String, Double> out = new LinkedHashMap<>();
        values.forEach((k, v) -> out.put(k, Double.parseDouble(String.format(Locale.ROOT, "%.3g", v))));
        return out;
    }
}
