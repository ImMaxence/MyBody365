package fr.mbonnici.mybody365.nutrition;

import fr.mbonnici.mybody365.config.AppProperties;
import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.nutrition.FoodStore.Food;
import fr.mbonnici.mybody365.nutrition.FoodStore.Source;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** The three sources of foods behind one search: the account's own, Ciqual, Open Food Facts. */
@Service
public class FoodService {

    private static final Logger log = LoggerFactory.getLogger(FoodService.class);
    private static final Duration OFF_REFRESH = Duration.ofDays(30);
    private static final Duration SEARCH_CACHE = Duration.ofHours(12);

    public record FoodDto(UUID id, Source source, String name, String brand, String category, Nutrients per100, String nutriscore,
            boolean nutriscoreEstimated, Double servingG, boolean mine,
            /** 1.12: a product's picture (through the server) and when Open Food Facts last changed its page */
            String imageUrl, Instant dataUpdatedAt,
            /**
             * 1.13: the health score and its reasons; a product's size, generic name and food group (to tell twenty « Biscoff »
             * apart); measured in millilitres (a drink, a milk, a soup) and the millilitres of its can or bottle
             */
            Health health, String quantity, String genericName, String kind, boolean liquid, Integer packageMl, Integer nova,
            /** 1.14: vitamins and minerals per 100 g (empty when unknown) */
            Map<String, Double> micros,
            /** 1.15: the close Ciqual food they were taken from, when the table had none for this one */
            String microsFrom) {}

    /** 1.13: out of 10 by halves; what makes it good, what costs it points (codes the app words) */
    public record Health(double score, List<String> pros, List<String> cons) {
        public static Health of(HealthScore.Result r) {
            return r == null ? null : new Health(r.score(), r.pros(), r.cons());
        }
    }

    public record FoodInput(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 160) String brand,
            @NotNull @DecimalMin("0") @DecimalMax("1000") Double kcal,
            @DecimalMin("0") @DecimalMax("100") Double proteinG,
            @DecimalMin("0") @DecimalMax("100") Double carbsG,
            @DecimalMin("0") @DecimalMax("100") Double sugarsG,
            @DecimalMin("0") @DecimalMax("100") Double fatG,
            @DecimalMin("0") @DecimalMax("100") Double satFatG,
            @DecimalMin("0") @DecimalMax("100") Double fiberG,
            @DecimalMin("0") @DecimalMax("100") Double saltG,
            @DecimalMin("1") @DecimalMax("2000") Double servingG) {}

    private record Cached(List<OpenFoodFacts.Product> products, Instant at) {}

    private final FoodStore foods;
    private final OpenFoodFacts off;
    private final OffImporter offLocal;
    private final AppProperties props;
    /** the same searches come back often (and Open Food Facts asks to keep them few) */
    private final Map<String, Cached> searchCache = new ConcurrentHashMap<>();

    /** 1.14: the pictures of the products kept for good (null in a test without storage) */
    private final fr.mbonnici.mybody365.storage.ObjectStorage storage;
    /** 1.14: the pictures Open Food Facts did not give lately, not asked again for an hour */
    private final java.util.Map<String, Long> failed = new java.util.concurrent.ConcurrentHashMap<>();
    /** 1.14: a few pictures fetched at a time: a list of 30 products does not send 30 requests at once */
    private final java.util.concurrent.Semaphore fetching = new java.util.concurrent.Semaphore(6);

    public FoodService(FoodStore foods, OpenFoodFacts off, OffImporter offLocal, AppProperties props,
            org.springframework.beans.factory.ObjectProvider<fr.mbonnici.mybody365.storage.ObjectStorage> storage) {
        this.storage = storage.getIfAvailable();
        this.foods = foods;
        this.off = off;
        this.offLocal = offLocal;
        this.props = props;
    }

    public FoodDto dto(Food f, UUID viewer) {
        ProductInfo info = f.info() == null ? ProductInfo.NONE : f.info();
        boolean liquid = HealthScore.liquid(f.source(), f.name(), f.category(), f.per100(), info);
        return new FoodDto(f.id(), f.source(), f.name(), f.brand(), f.category(), f.per100().rounded(), f.nutriscore(),
                f.nutriscoreEstimated(), f.servingG(), viewer != null && viewer.equals(f.ownerId()), imageUrl(f), f.sourceUpdatedAt(),
                Health.of(HealthScore.score(HealthScore.of(f))), info.quantity(), info.genericName(), info.pnns(), liquid,
                liquid ? ProductInfo.millilitres(info.quantity()) : null, info.nova(), Micros.rounded(f.micros()), f.microsFrom());
    }

    /** 1.13: a food's health score as a meal line keeps it (null when it cannot be judged) */
    public static Double health(Food f) {
        HealthScore.Result r = HealthScore.score(HealthScore.of(f));
        return r == null ? null : r.score();
    }

    public static boolean liquid(Food f) {
        return HealthScore.liquid(f.source(), f.name(), f.category(), f.per100(), f.info());
    }

    /**
     * 1.13: the best of the candidates first: what this member eats often, what the members note the most, their own foods,
     * a name starting with the first word or holding every word whole, a brand typed in the search; for the products, the
     * most scanned and the complete ones (a picture, a brand, an official grade), never a page without its calories
     */
    List<Food> rank(List<Food> candidates, List<String> words, UUID viewer, int limit) {
        Map<UUID, Integer> mine = viewer == null ? Map.of() : foods.usesBy(viewer, candidates.stream().map(Food::id).toList());
        record Scored(Food f, double score) {}
        List<Scored> scored = new ArrayList<>();
        for (Food f : candidates) {
            String name = SearchText.normalize(f.name());
            List<String> nameWords = List.of(name.split(" "));
            String brand = f.brand() == null ? "" : SearchText.normalize(f.brand());
            List<String> brandWords = brand.isEmpty() ? List.of() : List.of(brand.split(" "));
            double s = 3 * log2(1 + mine.getOrDefault(f.id(), 0)) + 1.5 * log2(1 + f.uses());
            if (f.source() == Source.USER) {
                s += 2;
            }
            if (!words.isEmpty() && name.startsWith(words.getFirst())) {
                s += 3;
            }
            if (words.stream().allMatch(w -> nameWords.contains(w) || brandWords.contains(w))) {
                s += 1.5;
            }
            if (words.stream().anyMatch(brandWords::contains)) {
                s += 2.5;
            }
            if (f.source() == Source.OFF) {
                ProductInfo info = f.info() == null ? ProductInfo.NONE : f.info();
                s += 1.2 * Math.log10(1 + (info.scans() == null ? 0 : info.scans()));
                s += f.imagePath() != null ? 0.8 : 0;
                s += f.brand() != null ? 0.4 : 0;
                s += f.nutriscore() != null && !f.nutriscoreEstimated() ? 0.3 : 0;
                HealthScore.Input in = HealthScore.of(f);
                if (f.per100().kcal() <= 0.5 && !in.water() && !in.drink()) {
                    s -= 4;
                }
            }
            s -= f.name().length() / 30.0;
            scored.add(new Scored(f, s));
        }
        scored.sort(java.util.Comparator.comparingDouble(Scored::score).reversed());
        return scored.stream().limit(limit).map(Scored::f).toList();
    }

    private static double log2(double v) {
        return Math.log(v) / Math.log(2);
    }

    /** 1.13: every hour, how many members noted each food this year: the popularity the searches rank by */
    @org.springframework.scheduling.annotation.Scheduled(initialDelayString = "PT2M", fixedDelayString = "PT1H")
    public void countUses() {
        try {
            foods.countUses();
        } catch (RuntimeException e) {
            log.warn("Food popularity not counted", e);
        }
    }

    /** the picture of a product through the server; the path in the URL changes with the picture, so it may be kept */
    public static String imageUrl(UUID foodId, String imagePath) {
        return imagePath == null ? null : "/api/foods/" + foodId + "/image?v=" + Integer.toHexString(imagePath.hashCode());
    }

    private static String imageUrl(Food f) {
        return f.source() == Source.OFF ? imageUrl(f.id(), f.imagePath()) : null;
    }

    /** the last pictures asked, for everybody (the same products come back in many meals), 16 MB at most */
    private static final long IMAGES_MAX_BYTES = 16L * 1024 * 1024;
    private final java.util.LinkedHashMap<String, byte[]> images = new java.util.LinkedHashMap<>(256, 0.75f, true);
    private long imagesBytes = 0;

    private synchronized byte[] cachedImage(String key) {
        return images.get(key);
    }

    private synchronized void keepImage(String key, byte[] bytes) {
        byte[] before = images.put(key, bytes);
        imagesBytes += bytes.length - (before == null ? 0 : before.length);
        var it = images.entrySet().iterator();
        while (imagesBytes > IMAGES_MAX_BYTES && it.hasNext()) {
            imagesBytes -= it.next().getValue().length;
            it.remove();
        }
    }

    /**
     * 1.12: a product's picture (small: for the lists), fetched from Open Food Facts then kept in memory. 1.14: kept for
     * good in the storage too (under off/, outside the members' u/ prefixes): fetched once ever, not again after a restart;
     * one that failed is not asked again for an hour, and 6 at most are fetched at a time.
     */
    public Optional<byte[]> image(UUID foodId, boolean small) {
        Food f = foods.find(foodId).orElseThrow(ApiException::notFound);
        if (f.source() != Source.OFF || f.imagePath() == null) {
            return Optional.empty();
        }
        String key = f.imagePath() + (small ? "#s" : "");
        byte[] hit = cachedImage(key);
        if (hit != null) {
            return Optional.of(hit);
        }
        String stored = "off/" + (small ? "s/" : "f/") + f.imagePath();
        byte[] kept = storedImage(stored);
        if (kept != null) {
            keepImage(key, kept);
            return Optional.of(kept);
        }
        Long failedAt = failed.get(key);
        if (failedAt != null && System.currentTimeMillis() - failedAt < 3_600_000L) {
            return Optional.empty();
        }
        Optional<byte[]> got;
        try {
            if (!fetching.tryAcquire(10, java.util.concurrent.TimeUnit.SECONDS)) {
                return Optional.empty();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        }
        try {
            got = off.image(f.imagePath(), small);
        } finally {
            fetching.release();
        }
        if (got.isPresent()) {
            failed.remove(key);
            keepImage(key, got.get());
            storeImage(stored, got.get());
        } else {
            if (failed.size() > 50_000) {
                failed.clear();
            }
            failed.put(key, System.currentTimeMillis());
        }
        return got;
    }

    private byte[] storedImage(String key) {
        if (storage == null) {
            return null;
        }
        try {
            return storage.get(key);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private void storeImage(String key, byte[] bytes) {
        if (storage == null) {
            return;
        }
        try {
            storage.put(key, bytes, OpenFoodFacts.imageType(bytes));
        } catch (RuntimeException e) {
            // kept in memory still: the next restart fetches it again
        }
    }

    /** a food the account may use: any shared one, or its own */
    public Food usable(UUID foodId, UUID userId) {
        Food f = foods.find(foodId).orElseThrow(ApiException::notFound);
        if (f.source() == Source.USER && !userId.equals(f.ownerId())) {
            throw ApiException.notFound();
        }
        return f;
    }

    /** the account's foods, Ciqual and the products already known, instantly */
    public List<FoodDto> searchLocal(UUID userId, String query) {
        // with the local copy, the products have their own list (below): "foods" stay the account's and Ciqual's
        List<String> words = SearchText.words(query);
        return rank(foods.search(userId, words, !offLocal.local(), 90), words, userId, 30).stream().map(f -> dto(f, userId)).toList();
    }

    /** the account's foods and Ciqual, without any product (the page « Aliments bruts ») */
    public List<FoodDto> searchCiqual(UUID userId, String query) {
        List<String> words = SearchText.words(query);
        return rank(foods.search(userId, words, false, 120), words, userId, 40).stream().map(f -> dto(f, userId)).toList();
    }

    /**
     * The products of Open Food Facts: in the local copy once an admin imported it (nothing leaves the
     * server), live otherwise (every product found is kept, so it can be logged right away).
     */
    public List<FoodDto> searchOff(UUID userId, String query) {
        String key = SearchText.normalize(query);
        if (key.length() < 2) {
            return List.of();
        }
        if (offLocal.local()) {
            List<String> words = SearchText.words(query);
            // a word of 3 letters at least: what the trigram index needs to stay fast over the whole copy
            if (words.stream().noneMatch(w -> w.length() >= 3)) {
                return List.of();
            }
            return rank(foods.searchOff(words, 200), words, userId, 40).stream().map(f -> dto(f, userId)).toList();
        }
        Cached c = searchCache.get(key);
        List<OpenFoodFacts.Product> products;
        if (c != null && c.at().isAfter(Instant.now().minus(SEARCH_CACHE))) {
            products = c.products();
        } else {
            try {
                products = off.search(query, 20);
            } catch (OpenFoodFacts.Unavailable e) {
                log.info("Open Food Facts search failed: {}", e.getMessage());
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "off_unavailable");
            }
            if (searchCache.size() > 2000) {
                searchCache.clear();
            }
            searchCache.put(key, new Cached(products, Instant.now()));
        }
        List<FoodDto> out = new ArrayList<>();
        for (OpenFoodFacts.Product p : products) {
            out.add(dto(upsert(p), userId));
        }
        return out;
    }

    public FoodDto barcode(UUID userId, String code) {
        if (code == null || !code.matches("\\d{6,14}")) {
            throw ApiException.badRequest("food_not_found");
        }
        Optional<Food> cached = foods.findOff(code);
        boolean local = offLocal.local();
        // the local copy answers (refreshed at each import); a product too new for it is asked live, if allowed.
        // 1.12: a product imported before its picture and its date were kept is asked live once, for them
        boolean beforePictures = cached.isPresent() && cached.get().sourceUpdatedAt() == null && props.nutrition().offLive();
        if (cached.isPresent() && !beforePictures && (local || cached.get().updatedAt().isAfter(Instant.now().minus(OFF_REFRESH)))) {
            return dto(cached.get(), userId);
        }
        if (local && !props.nutrition().offLive()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "food_not_found");
        }
        try {
            Optional<OpenFoodFacts.Product> p = off.product(code);
            if (p.isEmpty()) {
                if (cached.isPresent()) {
                    return dto(cached.get(), userId);
                }
                throw new ApiException(HttpStatus.NOT_FOUND, "food_not_found");
            }
            return dto(upsert(p.get()), userId);
        } catch (OpenFoodFacts.Unavailable e) {
            if (cached.isPresent()) {
                return dto(cached.get(), userId);
            }
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "off_unavailable");
        }
    }

    Food upsert(OpenFoodFacts.Product p) {
        String grade = p.nutriscore() != null ? p.nutriscore() : Nutriscore.grade(p.per100());
        boolean estimated = p.nutriscore() == null && grade != null;
        Optional<Food> existing = foods.findOff(p.code());
        if (existing.isPresent()) {
            foods.update(existing.get().id(), p.name(), p.brand(), p.per100(), grade, estimated, p.servingG());
            foods.productPage(existing.get().id(), p.imagePath() != null ? p.imagePath() : existing.get().imagePath(), p.modifiedAt());
            if (p.info() != null) {
                foods.productInfo(existing.get().id(), p.info());
            }
            return foods.find(existing.get().id()).orElseThrow();
        }
        try {
            UUID id = foods.insert(Source.OFF, p.code(), null, null, p.name(), null, p.brand(), null, p.per100(), grade, estimated,
                    p.servingG(), p.info() == null ? ProductInfo.NONE : p.info());
            foods.productPage(id, p.imagePath(), p.modifiedAt());
            return foods.find(id).orElseThrow();
        } catch (DuplicateKeyException e) {
            // the same product saved at the same moment by another request
            return foods.findOff(p.code()).orElseThrow();
        }
    }

    // ── the account's own foods ──────────────────────────────────────────────

    /**
     * 1.11: before a food of one's own is created, the ones that may be the same: close names (the brand counts too)
     * and, when the calories are given, close calories. One's own first (« tu l'as déjà »), then Ciqual and the products.
     */
    public List<FoodDto> lookalikes(UUID userId, String name, String brand, Double kcal) {
        String text = SearchText.normalize((name == null ? "" : name) + " " + (brand == null ? "" : brand));
        List<String> words = SearchText.words(text);
        if (words.isEmpty()) {
            return List.of();
        }
        Map<UUID, Food> found = new java.util.LinkedHashMap<>();
        foods.search(userId, words, true, 30).forEach(f -> found.putIfAbsent(f.id(), f));
        foods.close(userId, text, 30).forEach(f -> found.putIfAbsent(f.id(), f));
        record Scored(Food f, double score) {}
        List<Scored> close = new java.util.ArrayList<>();
        for (Food f : found.values()) {
            double s = nameSimilarity(text, f.name() + " " + (f.brand() == null ? "" : f.brand()));
            boolean kcalClose = kcal == null || Math.abs(f.per100().kcal() - kcal) <= Math.max(20, 0.15 * Math.max(kcal, f.per100().kcal()));
            if (s >= 0.8 || (s >= 0.5 && kcalClose)) {
                close.add(new Scored(f, s + (f.source() == Source.USER ? 1 : 0) + (kcal != null && kcalClose ? 0.2 : 0)));
            }
        }
        close.sort(java.util.Comparator.comparingDouble(Scored::score).reversed());
        return close.stream().limit(3).map(s -> dto(s.f(), userId)).toList();
    }

    /** the share of both texts' words found in the other one (a word may be the start of the other: « grec », « grecque ») */
    static double nameSimilarity(String a, String b) {
        List<String> x = significant(a);
        List<String> y = significant(b);
        if (x.isEmpty() || y.isEmpty()) {
            return 0;
        }
        long found = x.stream().filter(w -> y.stream().anyMatch(v -> alike(w, v))).count()
                + y.stream().filter(w -> x.stream().anyMatch(v -> alike(w, v))).count();
        return found / (double) (x.size() + y.size());
    }

    private static List<String> significant(String text) {
        java.util.Set<String> stop = java.util.Set.of("de", "du", "des", "la", "le", "les", "au", "aux", "en", "et", "ou", "un", "une", "a", "d", "l",
                "avec", "sans", "pour", "cru", "crue", "crus", "crues", "cuit", "cuite", "nature", "preemballe", "preemballee", "aliment", "moyen");
        return java.util.Arrays.stream(SearchText.normalize(text).split(" ")).filter(w -> w.length() >= 2 && !stop.contains(w)).distinct()
                .toList();
    }

    private static boolean alike(String x, String y) {
        return x.equals(y) || (x.length() >= 4 && y.length() >= 4 && (x.startsWith(y) || y.startsWith(x)));
    }

    public List<FoodDto> mine(UUID userId) {
        return foods.ownedBy(userId).stream().map(f -> dto(f, userId)).toList();
    }

    public FoodDto create(UUID userId, FoodInput in) {
        Nutrients n = nutrients(in);
        String grade = Nutriscore.grade(n);
        UUID id = foods.insert(Source.USER, null, null, userId, in.name().strip(), null, blank(in.brand()), null, n, grade,
                grade != null, in.servingG());
        return dto(foods.find(id).orElseThrow(), userId);
    }

    public FoodDto update(UUID userId, UUID foodId, FoodInput in) {
        Food f = own(userId, foodId);
        Nutrients n = nutrients(in);
        String grade = Nutriscore.grade(n);
        foods.update(f.id(), in.name().strip(), blank(in.brand()), n, grade, grade != null, in.servingG());
        return dto(foods.find(f.id()).orElseThrow(), userId);
    }

    /** meals and recipes keep their copy of the nutrients: deleting a food never changes them */
    public void delete(UUID userId, UUID foodId) {
        foods.delete(own(userId, foodId).id());
    }

    private Food own(UUID userId, UUID foodId) {
        Food f = foods.find(foodId).orElseThrow(ApiException::notFound);
        if (f.source() != Source.USER || !userId.equals(f.ownerId())) {
            throw ApiException.notFound();
        }
        return f;
    }

    private static Nutrients nutrients(FoodInput in) {
        return new Nutrients(in.kcal(), in.proteinG(), in.carbsG(), in.sugarsG(), in.fatG(), in.satFatG(), in.fiberG(), in.saltG());
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
