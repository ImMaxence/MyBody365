package fr.mbonnici.mybody365.nutrition;

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
            boolean nutriscoreEstimated, Double servingG, boolean mine) {}

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
    /** the same searches come back often (and Open Food Facts asks to keep them few) */
    private final Map<String, Cached> searchCache = new ConcurrentHashMap<>();

    public FoodService(FoodStore foods, OpenFoodFacts off) {
        this.foods = foods;
        this.off = off;
    }

    public FoodDto dto(Food f, UUID viewer) {
        return new FoodDto(f.id(), f.source(), f.name(), f.brand(), f.category(), f.per100().rounded(), f.nutriscore(),
                f.nutriscoreEstimated(), f.servingG(), viewer != null && viewer.equals(f.ownerId()));
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
        return foods.search(userId, SearchText.words(query), true, 30).stream().map(f -> dto(f, userId)).toList();
    }

    /** Open Food Facts, live: every product found is kept, so it can be logged right away */
    public List<FoodDto> searchOff(UUID userId, String query) {
        String key = SearchText.normalize(query);
        if (key.length() < 2) {
            return List.of();
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
        if (cached.isPresent() && cached.get().updatedAt().isAfter(Instant.now().minus(OFF_REFRESH))) {
            return dto(cached.get(), userId);
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
            return foods.find(existing.get().id()).orElseThrow();
        }
        try {
            UUID id = foods.insert(Source.OFF, p.code(), null, null, p.name(), null, p.brand(), null, p.per100(), grade, estimated,
                    p.servingG());
            return foods.find(id).orElseThrow();
        } catch (DuplicateKeyException e) {
            // the same product saved at the same moment by another request
            return foods.findOff(p.code()).orElseThrow();
        }
    }

    // ── the account's own foods ──────────────────────────────────────────────

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
