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
    public record Product(String code, String name, String brand, Nutrients per100, String nutriscore, Double servingG,
            /** 1.12: the front picture (its path on images.openfoodfacts.org) and when the page last changed */
            String imagePath, java.time.Instant modifiedAt) {}

    /** where the pictures of the products are; only paths under it are ever fetched */
    static final String IMAGES = "https://images.openfoodfacts.org/images/products/";
    private static final java.util.regex.Pattern IMAGE_PATH = java.util.regex.Pattern.compile("[0-9]{1,14}(/[0-9]{1,14}){0,4}/[A-Za-z0-9_.-]{1,80}\\.(jpg|jpeg|png|webp)");
    private static final int IMAGE_MAX_BYTES = 1_000_000;

    public static class Unavailable extends RuntimeException {
        Unavailable(String message) {
            super(message);
        }
    }

    private static final String FIELDS = "code,product_name,product_name_fr,generic_name_fr,brands,nutriments,nutriscore_grade,serving_quantity,"
            + "image_front_url,image_url,image_front_small_url,image_small_url,last_modified_t";

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
        String image = imagePath(firstNonBlank(text(p.path("image_front_url")), text(p.path("image_url")), text(p.path("image_front_small_url")),
                text(p.path("image_small_url"))));
        Double modified = number(p.path("last_modified_t"));
        return Optional.of(new Product(code, cut(name, 200), brand == null || brand.isBlank() ? null : cut(brand, 160), per100, grade,
                serving, image, epoch(modified)));
    }

    /** « https://images.openfoodfacts.org/images/products/301/762/042/2003/front_fr.633.400.jpg » → its path; null otherwise */
    static String imagePath(String url) {
        if (url == null) {
            return null;
        }
        String u = url.strip().replace("http://", "https://").replace("https://static.openfoodfacts.org/images/products/", IMAGES);
        if (!u.startsWith(IMAGES)) {
            return null;
        }
        String path = u.substring(IMAGES.length());
        return path.length() <= 160 && IMAGE_PATH.matcher(path).matches() ? path : null;
    }

    /** seconds since 1970 (last_modified_t), when they make a plausible date */
    static java.time.Instant epoch(Double seconds) {
        if (seconds == null || seconds < 1_000_000_000d || seconds > 4_000_000_000d) {
            return null;
        }
        return java.time.Instant.ofEpochSecond(seconds.longValue());
    }

    /**
     * 1.12: the picture of a product, fetched by the server (the phone never calls Open Food Facts): a path of the
     * images host only, an image only (its first bytes say so), 1 MB at most; small: the 200 px one when there is one.
     */
    public Optional<byte[]> image(String path, boolean small) {
        if (path == null || !IMAGE_PATH.matcher(path).matches()) {
            return Optional.empty();
        }
        String wanted = small ? path.replace(".400.", ".200.") : path;
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(IMAGES + wanted)).timeout(Duration.ofSeconds(8))
                    .header("User-Agent", cfg.offUserAgent()).GET().build();
            HttpResponse<java.io.InputStream> res = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
            try (java.io.InputStream in = res.body()) {
                if (res.statusCode() != 200) {
                    return small && !wanted.equals(path) ? image(path, false) : Optional.empty();
                }
                byte[] bytes = in.readNBytes(IMAGE_MAX_BYTES + 1);
                if (bytes.length > IMAGE_MAX_BYTES || imageType(bytes) == null) {
                    return Optional.empty();
                }
                return Optional.of(bytes);
            }
        } catch (IOException | RuntimeException e) {
            return Optional.empty();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        }
    }

    /** the type of a picture from its first bytes (JPEG, PNG, WebP), null for anything else */
    public static String imageType(byte[] b) {
        if (b.length > 3 && (b[0] & 0xff) == 0xff && (b[1] & 0xff) == 0xd8 && (b[2] & 0xff) == 0xff) {
            return "image/jpeg";
        }
        if (b.length > 8 && (b[0] & 0xff) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
            return "image/png";
        }
        if (b.length > 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') {
            return "image/webp";
        }
        return null;
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
