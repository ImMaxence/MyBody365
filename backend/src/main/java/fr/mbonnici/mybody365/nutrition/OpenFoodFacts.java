package fr.mbonnici.mybody365.nutrition;

import fr.mbonnici.mybody365.config.AppProperties;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Open Food Facts, asked by the server (never by the phone: no third-party request from the app, and one
 * cache for everybody). Only public product data travels; nothing about the account.
 */
@Component
public class OpenFoodFacts {

    /** what the app keeps of a product */
    public record Product(String code, String name, String brand, Nutrients per100, String nutriscore, Double servingG) {}

    public static class Unavailable extends RuntimeException {
        Unavailable(String message) {
            super(message);
        }
    }

    private static final String FIELDS = "code,product_name,product_name_fr,generic_name_fr,brands,nutriments,nutriscore_grade,serving_quantity";

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NORMAL).build();
    private final AppProperties.Nutrition cfg;
    private final JsonMapper json;

    public OpenFoodFacts(AppProperties props, JsonMapper json) {
        this.cfg = props.nutrition();
        this.json = json;
    }

    /** a product by barcode; empty when Open Food Facts does not know it (or has no energy for it) */
    public Optional<Product> product(String code) {
        JsonNode root = get(cfg.offUrl() + "/api/v2/product/" + code + "?fields=" + FIELDS);
        if (root.path("status").asInt(0) != 1) {
            return Optional.empty();
        }
        return parse(root.path("product"), code);
    }

    /** a text search, products with an energy only */
    public List<Product> search(String query, int size) {
        String q = URLEncoder.encode(query, StandardCharsets.UTF_8);
        JsonNode root = get(cfg.offSearchUrl() + "/search?q=" + q + "&page_size=" + size + "&langs=fr&fields=" + FIELDS);
        List<Product> out = new ArrayList<>();
        for (JsonNode hit : root.path("hits")) {
            parse(hit, null).ifPresent(out::add);
        }
        return out;
    }

    private JsonNode get(String url) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(8))
                    .header("User-Agent", cfg.offUserAgent()).header("Accept", "application/json").GET().build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() == 404) {
                return json.readTree("{\"status\":0}");
            }
            if (res.statusCode() >= 400) {
                throw new Unavailable("HTTP " + res.statusCode());
            }
            return json.readTree(res.body());
        } catch (IOException e) {
            throw new Unavailable(e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new Unavailable("interrupted");
        } catch (RuntimeException e) {
            if (e instanceof Unavailable u) {
                throw u;
            }
            throw new Unavailable(e.getMessage());
        }
    }

    static Optional<Product> parse(JsonNode p, String fallbackCode) {
        String code = text(p.path("code"));
        if (code == null) {
            code = fallbackCode;
        }
        if (code == null || !code.matches("\\d{6,14}")) {
            return Optional.empty();
        }
        String name = firstNonBlank(text(p.path("product_name_fr")), text(p.path("product_name")), text(p.path("generic_name_fr")));
        JsonNode n = p.path("nutriments");
        Double kcal = number(n.path("energy-kcal_100g"));
        if (kcal == null) {
            Double kj = number(n.path("energy_100g"));
            kcal = kj == null ? null : kj / 4.184;
        }
        if (name == null || kcal == null || kcal < 0 || kcal > 1000) {
            return Optional.empty();
        }
        String brand = null;
        JsonNode brands = p.path("brands");
        if (brands.isArray() && !brands.isEmpty()) {
            brand = text(brands.get(0));
        } else if (brands.isString()) {
            brand = brands.asString().split(",")[0].trim();
        }
        String grade = text(p.path("nutriscore_grade"));
        if (grade == null || !grade.matches("[a-e]")) {
            grade = null;
        }
        Double serving = number(p.path("serving_quantity"));
        if (serving != null && (serving <= 0 || serving > 2000)) {
            serving = null;
        }
        Nutrients per100 = new Nutrients(kcal, number(n.path("proteins_100g")), number(n.path("carbohydrates_100g")),
                number(n.path("sugars_100g")), number(n.path("fat_100g")), number(n.path("saturated-fat_100g")),
                number(n.path("fiber_100g")), number(n.path("salt_100g")));
        return Optional.of(new Product(code, cut(name, 200), brand == null || brand.isBlank() ? null : cut(brand, 160), per100, grade,
                serving));
    }

    private static String text(JsonNode node) {
        if (node == null || !node.isString()) {
            return null;
        }
        String s = node.asString().trim();
        return s.isEmpty() ? null : s;
    }

    private static Double number(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        if (node.isNumber()) {
            return node.doubleValue();
        }
        if (node.isString()) {
            try {
                return Double.parseDouble(node.asString().replace(',', '.'));
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v;
            }
        }
        return null;
    }

    private static String cut(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }
}
