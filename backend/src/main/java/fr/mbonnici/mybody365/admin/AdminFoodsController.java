package fr.mbonnici.mybody365.admin;

import fr.mbonnici.mybody365.admin.AuditService.Action;
import fr.mbonnici.mybody365.admin.AuditService.Target;
import fr.mbonnici.mybody365.nutrition.CiqualImporter;
import fr.mbonnici.mybody365.nutrition.CiqualImporter.ImportDto;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.UserService;
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
            List<ImportDto> imports) {}

    private final CiqualImporter ciqual;
    private final UserService users;
    private final AuditService audit;
    private final JdbcTemplate jdbc;

    public AdminFoodsController(CiqualImporter ciqual, UserService users, AuditService audit, JdbcTemplate jdbc) {
        this.ciqual = ciqual;
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
                ((Number) c.get("off")).longValue(), ((Number) c.get("mine")).longValue(), ciqual.history(10));
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
}
