package fr.mbonnici.mybody365.nutrition;

import fr.mbonnici.mybody365.nutrition.FoodService.FoodDto;
import fr.mbonnici.mybody365.nutrition.FoodService.FoodInput;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class FoodController {

    private final FoodService foods;
    private final UserService users;
    private final CiqualImporter ciqual;
    private final OffImporter off;
    private final JdbcTemplate jdbc;

    public FoodController(FoodService foods, UserService users, CiqualImporter ciqual, OffImporter off, JdbcTemplate jdbc) {
        this.foods = foods;
        this.users = users;
        this.ciqual = ciqual;
        this.off = off;
        this.jdbc = jdbc;
    }

    /**
     * Where the foods come from, for the members (1.9: the pages « Produits industriels » and « Aliments bruts »): the
     * Ciqual table in use and when it was last checked, the local copy of Open Food Facts and its date (none: asked live).
     */
    public record Sources(String ciqualVersion, long ciqualFoods, Instant ciqualAt, Instant offLocalAt, long offProducts) {}

    @GetMapping("/api/foods/sources")
    public Sources sources() {
        java.sql.Timestamp at = jdbc.queryForObject("""
                select coalesce((select max(finished_at) from ciqual_import where status in ('DONE', 'UP_TO_DATE')),
                                (select max(updated_at) from food where source = 'CIQUAL' and not superseded))""", java.sql.Timestamp.class);
        Long ciqualFoods = jdbc.queryForObject("select count(*) from food where source = 'CIQUAL' and not superseded", Long.class);
        Long offProducts = jdbc.queryForObject("select count(*) from food where source = 'OFF'", Long.class);
        return new Sources(ciqual.currentVersion(), ciqualFoods == null ? 0 : ciqualFoods, at == null ? null : at.toInstant(), off.localAt(),
                offProducts == null ? 0 : offProducts);
    }

    /**
     * source=local: the account's foods, Ciqual and known products; source=ciqual: the account's foods and Ciqual only;
     * source=off: Open Food Facts (the local copy, or live)
     */
    @GetMapping("/api/foods/search")
    public List<FoodDto> search(@RequestParam String q, @RequestParam(defaultValue = "local") String source, Authentication auth) {
        UUID me = users.current(auth).getId();
        String query = q.length() > 80 ? q.substring(0, 80) : q;
        return switch (source) {
            case "off" -> foods.searchOff(me, query);
            case "ciqual" -> foods.searchCiqual(me, query);
            default -> foods.searchLocal(me, query);
        };
    }

    @GetMapping("/api/foods/barcode/{code}")
    public FoodDto barcode(@PathVariable String code, Authentication auth) {
        return foods.barcode(users.current(auth).getId(), code);
    }

    @GetMapping("/api/foods/{id}")
    public FoodDto get(@PathVariable UUID id, Authentication auth) {
        UUID me = users.current(auth).getId();
        return foods.dto(foods.usable(id, me), me);
    }

    /** 1.12: the picture of a product, through the server; the URL changes with the picture, so the phone keeps it */
    @GetMapping("/api/foods/{id}/image")
    public org.springframework.http.ResponseEntity<byte[]> image(@PathVariable UUID id, @RequestParam(defaultValue = "small") String size) {
        return foods.image(id, !"full".equals(size))
                .map(b -> org.springframework.http.ResponseEntity.ok()
                        .contentType(org.springframework.http.MediaType.parseMediaType(OpenFoodFacts.imageType(b)))
                        .cacheControl(org.springframework.http.CacheControl.maxAge(30, java.util.concurrent.TimeUnit.DAYS).cachePrivate())
                        .body(b))
                .orElseGet(() -> org.springframework.http.ResponseEntity.notFound().build());
    }

    @GetMapping("/api/me/foods")
    public List<FoodDto> mine(Authentication auth) {
        return foods.mine(users.current(auth).getId());
    }

    /** 1.11: a food about to be created, nothing saved: the ones that may be the same */
    public record FoodQuery(@jakarta.validation.constraints.Size(max = 200) String name, @jakarta.validation.constraints.Size(max = 160) String brand,
            @jakarta.validation.constraints.DecimalMin("0") @jakarta.validation.constraints.DecimalMax("1000") Double kcal) {}

    @PostMapping("/api/me/foods/lookalikes")
    public List<FoodDto> lookalikes(@jakarta.validation.Valid @RequestBody FoodQuery body, Authentication auth) {
        return foods.lookalikes(users.current(auth).getId(), body.name(), body.brand(), body.kcal());
    }

    @PostMapping("/api/me/foods")
    @ResponseStatus(HttpStatus.CREATED)
    public FoodDto create(@Valid @RequestBody FoodInput body, Authentication auth) {
        return foods.create(users.current(auth).getId(), body);
    }

    @PutMapping("/api/me/foods/{id}")
    public FoodDto update(@PathVariable UUID id, @Valid @RequestBody FoodInput body, Authentication auth) {
        return foods.update(users.current(auth).getId(), id, body);
    }

    @DeleteMapping("/api/me/foods/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, Authentication auth) {
        foods.delete(users.current(auth).getId(), id);
    }
}
