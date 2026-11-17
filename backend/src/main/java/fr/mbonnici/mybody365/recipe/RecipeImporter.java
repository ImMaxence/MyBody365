package fr.mbonnici.mybody365.recipe;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.recipe.RecipeService.Type;
import java.net.URI;
import java.net.URISyntaxException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Base64;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * A recipe read from a recipe site: the schema.org "Recipe" data most sites publish for search engines
 * (name, servings, ingredients, steps, sometimes the calories). Nothing is saved here: the member gets a
 * draft, checks it and saves it as a recipe of their own, with the link to the source. Each ingredient comes
 * with the Ciqual food it most probably is ({@link IngredientMatcher}): the calories and the Nutri-Score are then
 * computed. The site's photo stays on the site, except on the sites whose photos may be copied (the creator's own).
 */
@Service
public class RecipeImporter {

    public record Draft(String name, Type type, Integer servings, List<String> ingredients, String instructions, Double kcal,
            Double proteinG, Double carbsG, Double fatG, String sourceUrl, String sourceName,
            /** each ingredient line with its food and weight, when found */
            List<IngredientMatcher.Match> matches,
            /** the photo, as a data: URL (the sites whose photos may be copied only) */
            String photo) {

        Draft with(List<IngredientMatcher.Match> m, String p) {
            return new Draft(name, type, servings, ingredients, instructions, kcal, proteinG, carbsG, fatG, sourceUrl, sourceName, m, p);
        }
    }

    /** a draft and the address of its photo */
    record Read(Draft draft, URI photo) {}

    /**
     * The sites whose photos come along with the recipe: the creator's own recipe site (les-creations-de-yona.fr),
     * whose photos the creator may copy. Any other site's photo stays on the site.
     */
    static final Set<String> PHOTO_SITES = Set.of("les-creations-de-yona.fr");

    static final int MAX_LINES = 80;
    private static final Pattern LD_JSON = Pattern.compile(
            "<script[^>]*type\\s*=\\s*[\"']?application/ld\\+json[\"']?[^>]*>(.*?)</script>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern NUMBER = Pattern.compile("(\\d+(?:[.,]\\d+)?)");
    private static final Pattern TAG = Pattern.compile("<[^>]+>");
    private static final Pattern ENTITY = Pattern.compile("&(#x[0-9a-fA-F]+|#\\d+|[a-zA-Z]+);");

    private final PageFetcher fetcher;
    private final JsonMapper json;
    private final IngredientMatcher matcher;

    public RecipeImporter(PageFetcher fetcher, JsonMapper json, IngredientMatcher matcher) {
        this.fetcher = fetcher;
        this.json = json;
        this.matcher = matcher;
    }

    public Draft read(String url, UUID viewer) {
        URI uri = parse(url);
        Read r = parse(fetcher.fetch(uri), uri);
        if (r == null) {
            throw ApiException.badRequest("recipe_not_found");
        }
        return r.draft().with(matcher.match(viewer, r.draft().ingredients()), photo(r.photo()));
    }

    /** a data: URL, or null when the photo cannot be had (the recipe comes without it) */
    private String photo(URI uri) {
        if (uri == null) {
            return null;
        }
        try {
            PageFetcher.Photo p = fetcher.image(uri);
            return "data:" + p.type() + ";base64," + Base64.getEncoder().encodeToString(p.bytes());
        } catch (RuntimeException e) {
            return null;
        }
    }

    static URI parse(String url) {
        if (url == null || url.isBlank() || url.length() > 500) {
            throw ApiException.badRequest("recipe_url_invalid");
        }
        try {
            URI uri = new URI(url.strip());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!(scheme.equals("https") || scheme.equals("http")) || uri.getHost() == null) {
                throw ApiException.badRequest("recipe_url_invalid");
            }
            // the fragment never goes to the site
            return new URI(uri.getScheme(), uri.getRawAuthority(), uri.getRawPath(), uri.getRawQuery(), null);
        } catch (URISyntaxException e) {
            throw ApiException.badRequest("recipe_url_invalid");
        }
    }

    /** the first Recipe of the page's JSON-LD blocks; null when there is none */
    Read parse(String html, URI source) {
        Matcher m = LD_JSON.matcher(html);
        while (m.find()) {
            String block = m.group(1).strip().replace("<![CDATA[", "").replace("]]>", "");
            JsonNode root;
            try {
                root = json.readTree(block);
            } catch (RuntimeException e) {
                continue; // a broken block: the next one may do
            }
            JsonNode recipe = find(root, 0);
            if (recipe != null) {
                Draft d = draft(recipe, source);
                return d == null ? null : new Read(d, photoOf(recipe.get("image"), source));
            }
        }
        return null;
    }

    private static JsonNode find(JsonNode n, int depth) {
        if (n == null || depth > 6) {
            return null;
        }
        if (n.isArray()) {
            for (JsonNode child : n) {
                JsonNode r = find(child, depth + 1);
                if (r != null) {
                    return r;
                }
            }
            return null;
        }
        if (!n.isObject()) {
            return null;
        }
        if (isRecipe(n.get("@type"))) {
            return n;
        }
        for (String key : List.of("@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item")) {
            JsonNode r = find(n.get(key), depth + 1);
            if (r != null) {
                return r;
            }
        }
        return null;
    }

    private static boolean isRecipe(JsonNode type) {
        if (type == null) {
            return false;
        }
        if (type.isArray()) {
            for (JsonNode t : type) {
                if (isRecipe(t)) {
                    return true;
                }
            }
            return false;
        }
        return type.isString() && (type.asString().equals("Recipe") || type.asString().endsWith("/Recipe")
                || type.asString().endsWith(":Recipe"));
    }

    /** "…/1600.webp", ["…"], {"url": "…"}: the first photo, on a site whose photos may be copied, over https */
    static URI photoOf(JsonNode image, URI source) {
        String host = source.getHost().toLowerCase(Locale.ROOT).replaceFirst("^www\\.", "");
        if (image == null || !PHOTO_SITES.contains(host)) {
            return null;
        }
        JsonNode first = image.isArray() ? (image.isEmpty() ? null : image.get(0)) : image;
        if (first != null && first.isObject()) {
            first = first.has("contentUrl") ? first.get("contentUrl") : first.get("url");
        }
        if (first == null || !first.isString()) {
            return null;
        }
        try {
            URI u = source.resolve(first.asString().strip());
            String h = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT).replaceFirst("^www\\.", "");
            return "https".equalsIgnoreCase(u.getScheme()) && PHOTO_SITES.contains(h) ? u : null;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static Draft draft(JsonNode r, URI source) {
        String name = cut(text(r.get("name")), 120);
        List<String> ingredients = new ArrayList<>();
        JsonNode ing = r.has("recipeIngredient") ? r.get("recipeIngredient") : r.get("ingredients");
        if (ing != null) {
            Iterable<JsonNode> items = ing.isArray() ? ing : List.of(ing);
            for (JsonNode i : items) {
                String line = cut(text(i), 300);
                if (!line.isEmpty() && ingredients.size() < MAX_LINES) {
                    ingredients.add(line);
                }
            }
        }
        List<String> steps = new ArrayList<>();
        steps(r.get("recipeInstructions"), steps, 0);
        StringBuilder instructions = new StringBuilder();
        int n = 0;
        for (String s : steps) {
            // each part counts its steps from 1, as on the site, after a blank line
            boolean part = s.startsWith("## ");
            if (part) {
                n = 0;
            }
            String line = part ? s.substring(3) : (++n) + ". " + s;
            if (instructions.length() + line.length() + 2 > 4000) {
                break;
            }
            if (!instructions.isEmpty()) {
                instructions.append(part ? "\n\n" : "\n");
            }
            instructions.append(line);
        }
        JsonNode nutrition = r.get("nutrition");
        Integer servings = servings(r.get("recipeYield"));
        // the values of the whole recipe (« la recette entière »), not of a serving: shared out
        double share = nutrition != null && servings != null && wholeRecipe(text(nutrition.get("servingSize"))) ? servings : 1;
        Double kcal = nutrition == null ? null : per(number(nutrition.get("calories")), share);
        if (kcal != null && (kcal < 1 || kcal > 5000)) {
            kcal = null;
        }
        String host = source.getHost().toLowerCase(Locale.ROOT).replaceFirst("^www\\.", "");
        if (name.isEmpty() && ingredients.isEmpty()) {
            return null;
        }
        return new Draft(name.isEmpty() ? host : name, type(r, name), servings, ingredients,
                instructions.isEmpty() ? null : instructions.toString(), kcal,
                nutrition == null ? null : grams(per(number(nutrition.get("proteinContent")), share)),
                nutrition == null ? null : grams(per(number(nutrition.get("carbohydrateContent")), share)),
                nutrition == null ? null : grams(per(number(nutrition.get("fatContent")), share)), source.toString(), host, List.of(), null);
    }

    private static boolean wholeRecipe(String servingSize) {
        String s = fold(servingSize);
        return s.contains("recette entiere") || s.contains("toute la recette") || s.contains("whole recipe") || s.contains("entire recipe");
    }

    private static Double per(Double v, double share) {
        return v == null ? null : Math.round(v / share * 10) / 10.0;
    }

    /** text, HowToStep, HowToSection (its name as a heading, then its steps) */
    private static void steps(JsonNode n, List<String> out, int depth) {
        if (n == null || depth > 4 || out.size() >= 60) {
            return;
        }
        if (n.isString()) {
            for (String line : decode(n.asString()).split("\\r?\\n|<br\\s*/?>")) {
                String s = clean(line);
                if (!s.isEmpty()) {
                    out.add(s);
                }
            }
        } else if (n.isArray()) {
            for (JsonNode c : n) {
                steps(c, out, depth + 1);
            }
        } else if (n.isObject()) {
            JsonNode items = n.get("itemListElement");
            if (items != null) {
                String title = text(n.get("name"));
                if (!title.isEmpty()) {
                    out.add("## " + title);
                }
                steps(items, out, depth + 1);
            } else {
                String s = text(n.has("text") ? n.get("text") : n.get("name"));
                if (!s.isEmpty()) {
                    out.add(s);
                }
            }
        }
    }

    /** "Pour 14 personnes", "4", ["4", "4 servings"] → the first number, between 1 and 50 */
    static Integer servings(JsonNode y) {
        if (y == null) {
            return null;
        }
        if (y.isArray()) {
            for (JsonNode c : y) {
                Integer s = servings(c);
                if (s != null) {
                    return s;
                }
            }
            return null;
        }
        // boxed on both sides: a text without a number gives null, not a crash
        Double v = y.isNumber() ? Double.valueOf(y.asDouble()) : number(y);
        if (v == null) {
            return null;
        }
        int s = (int) Math.round(v);
        return s >= 1 && s <= 50 ? s : null;
    }

    /** the recipe's category, or its name: a best guess the member can change */
    static Type type(JsonNode r, String name) {
        String hay = fold(text(r.get("recipeCategory")) + " " + name);
        if (hay.matches(".*(dessert|gateau|tarte sucree|patisserie|cake|cookie|biscuit|mousse|glace|crumble).*")) {
            return Type.DESSERT;
        }
        if (hay.matches(".*(boisson|cocktail|smoothie|jus|drink|milkshake|limonade|the glace).*")) {
            return Type.DRINK;
        }
        if (hay.matches(".*(petit[- ]dejeuner|breakfast|brunch|porridge|pancake|granola).*")) {
            return Type.BREAKFAST;
        }
        if (hay.matches(".*(apero|aperitif|tapas|amuse|snack|gouter|en-cas|encas|entree|starter|bruschetta|toast).*")) {
            return Type.SNACK;
        }
        if (hay.matches(".*(diner|dinner|soupe|veloute).*")) {
            return Type.DINNER;
        }
        return Type.LUNCH;
    }

    private static String fold(String s) {
        return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
    }

    private static Double number(JsonNode n) {
        if (n == null) {
            return null;
        }
        if (n.isNumber()) {
            return n.asDouble();
        }
        if (n.isArray() && !n.isEmpty()) {
            return number(n.get(0));
        }
        if (!n.isString()) {
            return null;
        }
        Matcher m = NUMBER.matcher(n.asString());
        return m.find() ? Double.parseDouble(m.group(1).replace(',', '.')) : null;
    }

    private static Double grams(Double v) {
        return v == null || v < 0 || v > 500 ? null : Math.round(v * 10) / 10.0;
    }

    private static String text(JsonNode n) {
        if (n == null) {
            return "";
        }
        if (n.isArray()) {
            List<String> parts = new ArrayList<>();
            for (JsonNode c : n) {
                String s = text(c);
                if (!s.isEmpty()) {
                    parts.add(s);
                }
            }
            return String.join(", ", parts);
        }
        if (n.isObject()) {
            return text(n.has("text") ? n.get("text") : n.get("name"));
        }
        return n.isString() ? clean(decode(n.asString())) : n.isNumber() ? n.asString() : "";
    }

    /** no tag, single spaces, and the doubled brackets some recipe plugins write ("((optional))") */
    private static String clean(String s) {
        return TAG.matcher(s).replaceAll(" ").replace("((", "(").replace("))", ")").replaceAll("\\s+", " ").strip();
    }

    /** the HTML entities sites leave in their JSON (&amp; &#39; &eacute;…) */
    static String decode(String s) {
        if (s.indexOf('&') < 0) {
            return s;
        }
        Matcher m = ENTITY.matcher(s);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String e = m.group(1);
            String r;
            try {
                if (e.startsWith("#x") || e.startsWith("#X")) {
                    r = new String(Character.toChars(Integer.parseInt(e.substring(2), 16)));
                } else if (e.startsWith("#")) {
                    r = new String(Character.toChars(Integer.parseInt(e.substring(1))));
                } else {
                    r = switch (e) {
                        case "amp" -> "&";
                        case "lt" -> "<";
                        case "gt" -> ">";
                        case "quot" -> "\"";
                        case "apos" -> "'";
                        case "nbsp" -> " ";
                        case "eacute" -> "é";
                        case "egrave" -> "è";
                        case "ecirc" -> "ê";
                        case "agrave" -> "à";
                        case "acirc" -> "â";
                        case "ccedil" -> "ç";
                        case "ocirc" -> "ô";
                        case "ucirc" -> "û";
                        case "icirc" -> "î";
                        case "rsquo", "lsquo" -> "’";
                        case "deg" -> "°";
                        case "oelig" -> "œ";
                        default -> m.group();
                    };
                }
            } catch (IllegalArgumentException ex) {
                r = m.group();
            }
            m.appendReplacement(out, Matcher.quoteReplacement(r));
        }
        m.appendTail(out);
        return out.toString();
    }

    private static String cut(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1).strip() + "…";
    }
}
