package fr.mbonnici.mybody365.nutrition;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/** What food searches compare: lower case, no accents, words separated by single spaces. */
public final class SearchText {

    private SearchText() {}

    public static String normalize(String s) {
        if (s == null) {
            return "";
        }
        String n = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        n = n.toLowerCase(Locale.ROOT).replace('œ', 'o').replace('æ', 'a').replaceAll("[^a-z0-9]+", " ").trim();
        return n.length() > 400 ? n.substring(0, 400) : n;
    }

    /** at most 5 words of 2 letters or more */
    public static List<String> words(String query) {
        return Arrays.stream(normalize(query).split(" ")).filter(w -> w.length() >= 2).distinct().limit(5).toList();
    }

    /** a LIKE pattern for a word, wildcards in the word itself escaped */
    public static String contains(String word) {
        return "%" + word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }
}
