package fr.mbonnici.mybody365.nutrition;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 1.15: about one Ciqual food in seven has no vitamin nor mineral in the table, among them everyday ingredients
 * (« Riz thaï ou basmati, cru », « Jambon cuit, choix », « Pâte à pizza, préemballée, crue »), so the recipes made with
 * them showed none. Such a food takes those of its closest sibling in the table: the same category, a name starting the
 * same way (« riz » with « thaï » or « basmati »; « Foie, agneau » is no sibling of « Agneau, gigot »), enriched in
 * vitamins or minerals both or neither, the most name words in common (the rare ones weigh more). Raw against cooked or
 * dried, the values follow the water: scaled by protein and carbohydrates (a raw dough holds less than the baked one);
 * otherwise they are taken as they are (added sugar or a sauce would fool the scaling: tried on the table, the foods with
 * values hidden one by one are guessed closer so). It stays unknown when nothing is close enough: « Sauce samouraï » is
 * not « Sauce soja », « Brochette de porc » is not « Brochette de poisson ».
 */
public final class MicrosSiblings {

    /** a food of the table: its values per 100 g, its vitamins and minerals (empty when the table has none) */
    public record Item(UUID id, String name, String category, Nutrients per100, Map<String, Double> micros) {}

    /** what a food without values takes, and from which food */
    public record Guess(UUID id, Map<String, Double> micros, String from) {}

    /** below it, two names are too far apart (tuned on the 2025 table: 293 of its 496 foods without values) */
    static final double MIN_SCORE = 0.3;
    /** a sibling 3.5 times denser or lighter is another food */
    private static final double MAX_FACTOR = 3.5;

    private static final Set<String> STOP = Set.of("de", "du", "des", "la", "le", "les", "a", "au", "aux", "et", "ou", "en", "pour", "avec",
            "sans", "d", "l", "type", "ex", "base", "environ", "aliment", "moyen", "etc", "un", "une", "sur", "par", "mg", "g");

    /** how much water a food holds, as its name says */
    enum State { RAW, COOKED, DRIED, UNSAID }

    /** « sec » in « raisins secs » or « grillée à sec », « cuit » in « mi-cuit »: not the food's own state */
    private static final Pattern NOT_A_STATE = Pattern.compile(" raisins? secs? | a sec | mi cuite?s? ");
    private static final Pattern DRIED = Pattern.compile(" (sec|secs|seche|seches|deshydratee?s?|lyophilisee?s?) ");
    private static final Pattern RECONSTITUTED = Pattern.compile(" reconstituee?s? ");
    private static final Pattern RAW = Pattern.compile(" (cru|crue|crus|crues|a cuire) ");
    private static final Pattern COOKED = Pattern.compile(" (cuit|cuite|cuits|cuites|bouillie?s?|reconstituee?s?) ");
    private static final Pattern ENRICHED = Pattern.compile("\\benrichi");

    private MicrosSiblings() {}

    /** the guesses for the foods of {@code table} that have no values */
    public static List<Guess> guess(List<Item> table) {
        Map<String, Integer> df = new HashMap<>();
        List<Set<String>> words = new ArrayList<>(table.size());
        List<List<String>> heads = new ArrayList<>(table.size());
        List<State> states = new ArrayList<>(table.size());
        List<Boolean> enriched = new ArrayList<>(table.size());
        for (Item f : table) {
            Set<String> w = new LinkedHashSet<>(words(f.name()));
            words.add(w);
            heads.add(words(f.name().split(",", 2)[0]));
            states.add(state(f.name()));
            enriched.add(enriched(f.name()));
            for (String x : w) {
                df.merge(x, 1, Integer::sum);
            }
        }
        double n = table.size();
        java.util.function.ToDoubleFunction<String> idf = w -> Math.log(n / df.getOrDefault(w, 1));
        List<Guess> out = new ArrayList<>();
        for (int i = 0; i < table.size(); i++) {
            Item t = table.get(i);
            if (!t.micros().isEmpty()) {
                continue;
            }
            List<String> head = heads.get(i);
            if (head.isEmpty()) {
                continue;
            }
            Set<String> a = words.get(i);
            int best = -1;
            double bestScore = MIN_SCORE;
            double bestFactor = 1;
            for (int j = 0; j < table.size(); j++) {
                Item c = table.get(j);
                Set<String> b = words.get(j);
                if (c.micros().isEmpty() || t.category() == null || !t.category().equals(c.category())
                        || !heads.get(j).contains(head.getFirst())
                        || (head.size() > 1 && head.subList(1, head.size()).stream().noneMatch(b::contains))
                        || !enriched.get(i).equals(enriched.get(j))) {
                    continue;
                }
                double density = factor(t.per100(), c.per100());
                if (density < 1 / MAX_FACTOR || density > MAX_FACTOR) {
                    continue;
                }
                double inter = 0;
                double union = 0;
                Set<String> all = new LinkedHashSet<>(a);
                all.addAll(b);
                for (String w : all) {
                    double x = idf.applyAsDouble(w);
                    union += x;
                    if (a.contains(w) && b.contains(w)) {
                        inter += x;
                    }
                }
                // the closer in density, the better
                double score = (union == 0 ? 0 : inter / union) - 0.1 * Math.abs(Math.log(density));
                if (score >= bestScore && (best < 0 || score > bestScore)) {
                    best = j;
                    bestScore = score;
                    bestFactor = states.get(i) == states.get(j) ? 1 : density;
                }
            }
            if (best >= 0) {
                Item c = table.get(best);
                out.add(new Guess(t.id(), Micros.times(c.micros(), bestFactor), c.name()));
            }
        }
        return out;
    }

    /**
     * how much more of everything the food holds than its sibling: its protein + carbohydrates against the sibling's (water
     * and cooking change them together), else its calories, else as much
     */
    static double factor(Nutrients t, Nutrients c) {
        double lt = lean(t);
        double lc = lean(c);
        if (lt >= 2 && lc >= 2) {
            return lt / lc;
        }
        if (t.kcal() > 0 && c.kcal() > 0) {
            return t.kcal() / c.kcal();
        }
        return 1;
    }

    private static double lean(Nutrients n) {
        return (n.proteinG() == null ? 0 : n.proteinG()) + (n.carbsG() == null ? 0 : n.carbsG());
    }

    /** « Pâte brisée, pur beurre, préemballée, crue » → raw; « Soupe au cresson, déshydratée reconstituée » → cooked */
    static State state(String name) {
        String p = NOT_A_STATE.matcher(" " + plain(name).replaceAll("[^a-z]+", " ") + " ").replaceAll(" ");
        if (DRIED.matcher(p).find() && !RECONSTITUTED.matcher(p).find()) {
            return State.DRIED;
        }
        if (RAW.matcher(p).find()) {
            return State.RAW;
        }
        return COOKED.matcher(p).find() ? State.COOKED : State.UNSAID;
    }

    /** « …, enrichies en vitamines et minéraux » is; « …, non enrichies en vitamines et minéraux » is not */
    static boolean enriched(String name) {
        String p = plain(name);
        return ENRICHED.matcher(p).find() && !p.contains("non enrichi");
    }

    /** « Pâtes sèches, aux œufs, crues » → pat, sech, oeuf, cru: no accents, no little words, no plural nor feminine */
    static List<String> words(String name) {
        List<String> out = new ArrayList<>();
        for (String w : plain(name).split("[^a-z0-9]+")) {
            if (w.isEmpty() || STOP.contains(w) || w.chars().allMatch(Character::isDigit)) {
                continue;
            }
            out.add(stem(w));
        }
        return out;
    }

    private static String plain(String name) {
        return Normalizer.normalize(name.toLowerCase(java.util.Locale.ROOT).replace("œ", "oe").replace("æ", "ae"), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
    }

    private static String stem(String w) {
        String s = w;
        if (s.length() > 3 && (s.endsWith("s") || s.endsWith("x"))) {
            s = s.substring(0, s.length() - 1);
        }
        if (s.length() > 3 && s.endsWith("e")) {
            s = s.substring(0, s.length() - 1);
        }
        return s;
    }
}
