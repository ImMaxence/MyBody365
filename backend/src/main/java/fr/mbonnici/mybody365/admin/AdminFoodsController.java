package fr.mbonnici.mybody365.admin;

import fr.mbonnici.mybody365.admin.AuditService.Action;
import fr.mbonnici.mybody365.admin.AuditService.Target;
import fr.mbonnici.mybody365.nutrition.CiqualImporter;
import fr.mbonnici.mybody365.nutrition.OffImporter;
import fr.mbonnici.mybody365.nutrition.CiqualImporter.ImportDto;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.UserService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The food data: which Ciqual table is in use, its update (started here, followed live) and the counts. */
@RestController
@RequestMapping("/api/admin/foods")
public class AdminFoodsController {

    public record FoodsOverview(String ciqualVersion, long ciqualFoods, long supersededFoods, long offProducts, long userFoods,
            List<ImportDto> imports, Instant offLocalAt, List<OffImporter.ImportDto> offImports) {}

    private final CiqualImporter ciqual;
    private final OffImporter off;
    private final UserService users;
    private final AuditService audit;
    private final JdbcTemplate jdbc;
    private final fr.mbonnici.mybody365.recipe.CommunityRecipes community;

    public AdminFoodsController(CiqualImporter ciqual, OffImporter off, UserService users, AuditService audit, JdbcTemplate jdbc,
            fr.mbonnici.mybody365.recipe.CommunityRecipes community) {
        this.community = community;
        this.ciqual = ciqual;
        this.off = off;
        this.users = users;
        this.audit = audit;
        this.jdbc = jdbc;
    }

    @GetMapping
    public FoodsOverview overview() {
        Map<String, Object> c = jdbc.queryForMap("""
                select count(*) filter (where source = 'CIQUAL' and not superseded) as ciqual,
                       count(*) filter (where source = 'CIQUAL' and superseded) as superseded,
                       count(*) filter (where source = 'OFF') as off,
                       count(*) filter (where source = 'USER') as mine
                from food""");
        return new FoodsOverview(ciqual.currentVersion(), ((Number) c.get("ciqual")).longValue(), ((Number) c.get("superseded")).longValue(),
                ((Number) c.get("off")).longValue(), ((Number) c.get("mine")).longValue(), ciqual.history(10), off.localAt(), off.history(5));
    }

    /** the community's first recipes: how many are in, how many wait for their Ciqual foods */
    @GetMapping("/community")
    public fr.mbonnici.mybody365.recipe.CommunityRecipes.Status community() throws java.io.IOException {
        return community.status();
    }

    /** adds the ones whose foods are now known (also done at each start and after each Ciqual import) */
    @org.springframework.web.bind.annotation.PostMapping("/community")
    public fr.mbonnici.mybody365.recipe.CommunityRecipes.Status seedCommunity() throws java.io.IOException {
        community.run();
        return community.status();
    }

    /** an ingredient of imported recipes that found no food (FOOD) or no weight (WEIGHT), and how often */
    public record Miss(String key, String reason, String example, int count, Instant lastAt) {}

    /** the most frequent first: what the tables of usual foods and weights should learn */
    @GetMapping("/misses")
    public List<Miss> misses() {
        return jdbc.query("select key, reason, example, count, last_at from ingredient_miss order by count desc, last_at desc limit 100",
                (rs, i) -> new Miss(rs.getString("key"), rs.getString("reason"), rs.getString("example"), rs.getInt("count"),
                        rs.getTimestamp("last_at").toInstant()));
    }

    /** one line done with (added to the tables), or all of them */
    @org.springframework.web.bind.annotation.DeleteMapping("/misses")
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void forget(@org.springframework.web.bind.annotation.RequestParam(required = false) String key,
            @org.springframework.web.bind.annotation.RequestParam(required = false) String reason) {
        if (key == null) {
            jdbc.update("delete from ingredient_miss");
        } else if (reason == null) {
            jdbc.update("delete from ingredient_miss where key = ?", key);
        } else {
            jdbc.update("delete from ingredient_miss where key = ? and reason = ?", key, reason);
        }
    }

    @PostMapping("/ciqual/import")
    public ImportDto start(Authentication auth) {
        AppUser me = users.current(auth);
        ImportDto started = ciqual.start(me.getId());
        audit.record(me, Action.CIQUAL_IMPORT_STARTED, new Target("CIQUAL", started.id().toString(), "Ciqual"), null);
        return started;
    }

    @GetMapping("/ciqual/imports/{id}")
    public ImportDto status(@PathVariable UUID id) {
        return ciqual.find(id);
    }

    /** the local copy of Open Food Facts: the whole export, read on our side (several minutes) */
    @PostMapping("/off/import")
    public OffImporter.ImportDto startOff(Authentication auth) {
        AppUser me = users.current(auth);
        OffImporter.ImportDto started = off.start(me.getId());
        audit.record(me, Action.OFF_IMPORT_STARTED, new Target("OFF", started.id().toString(), "Open Food Facts"), null);
        return started;
    }

    @GetMapping("/off/imports/{id}")
    public OffImporter.ImportDto offStatus(@PathVariable UUID id) {
        return off.find(id);
    }
}
