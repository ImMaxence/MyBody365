package fr.mbonnici.mybody365.recipe;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.recipe.RecipeService.Type;
import java.net.URI;
import java.net.URISyntaxException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * A recipe read from a recipe site: the schema.org "Recipe" data most sites publish for search engines
 * (name, servings, ingredients, steps, sometimes the calories). Nothing is saved here: the member gets a
 * draft, checks it, enters the calories per serving and saves it as a recipe of their own, with the link
 * to the source. The site's photo stays on the site.
 */
@Service
public class RecipeImporter {

    public record Draft(String name, Type type, Integer servings, List<String> ingredients, String instructions, Double kcal,
            Double proteinG, Double carbsG, Double fatG, String sourceUrl, String sourceName) {}

    static final int MAX_LINES = 80;
    private static final Pattern LD_JSON = Pattern.compile(
            "<script[^>]*type\\s*=\\s*[\"']?application/ld\\+json[\"']?[^>]*>(.*?)</script>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern NUMBER = Pattern.compile("(\\d+(?:[.,]\\d+)?)");
    private static final Pattern TAG = Pattern.compile("<[^>]+>");
    private static final Pattern ENTITY = Pattern.compile("&(#x[0-9a-fA-F]+|#\\d+|[a-zA-Z]+);");

    private final PageFetcher fetcher;
    private final JsonMapper json;

    public RecipeImporter(PageFetcher fetcher, JsonMapper json) {
        this.fetcher = fetcher;
        this.json = json;
    }

    public Draft read(String url) {
        URI uri = parse(url);
        Draft d = parse(fetcher.fetch(uri), uri);
        if (d == null) {
            throw ApiException.badRequest("recipe_not_found");
        }
        return d;
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
    Draft parse(String html, URI source) {
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
                return draft(recipe, source);
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
            String line = s.startsWith("## ") ? s.substring(3) : (++n) + ". " + s;
            if (instructions.length() + line.length() + 1 > 4000) {
                break;
            }
            if (!instructions.isEmpty()) {
                instructions.append('\n');
            }
            instructions.append(line);
        }
        JsonNode nutrition = r.get("nutrition");
        Double kcal = nutrition == null ? null : number(nutrition.get("calories"));
        if (kcal != null && (kcal < 1 || kcal > 5000)) {
            kcal = null;
        }
        String host = source.getHost().toLowerCase(Locale.ROOT).replaceFirst("^www\\.", "");
        if (name.isEmpty() && ingredients.isEmpty()) {
            return null;
        }
        return new Draft(name.isEmpty() ? host : name, type(r, name), servings(r.get("recipeYield")), ingredients,
                instructions.isEmpty() ? null : instructions.toString(), kcal,
                nutrition == null ? null : grams(nutrition.get("proteinContent")),
                nutrition == null ? null : grams(nutrition.get("carbohydrateContent")),
                nutrition == null ? null : grams(nutrition.get("fatContent")), source.toString(), host);
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

    private static Double grams(JsonNode n) {
        Double v = number(n);
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
