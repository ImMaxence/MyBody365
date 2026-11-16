package fr.mbonnici.mybody365.admin;

import fr.mbonnici.mybody365.admin.AuditService.Action;
import fr.mbonnici.mybody365.admin.AuditService.Target;
import fr.mbonnici.mybody365.friends.ReportService;
import fr.mbonnici.mybody365.friends.ReportService.ReportDto;
import fr.mbonnici.mybody365.recipe.RecipeService;
import fr.mbonnici.mybody365.recipe.RecipeService.RecipeDto;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.UserService;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Reports to handle, and the recipes shared with the community (to hide or put back). */
@RestController
@RequestMapping("/api/admin")
public class AdminModerationController {

    public record ModerationView(List<ReportDto> reports, List<RecipeDto> recipes) {}

    private final ReportService reports;
    private final RecipeService recipes;
    private final UserService users;
    private final AuditService audit;

    public AdminModerationController(ReportService reports, RecipeService recipes, UserService users, AuditService audit) {
        this.reports = reports;
        this.recipes = recipes;
        this.users = users;
        this.audit = audit;
    }

    @GetMapping("/moderation")
    public ModerationView view(Authentication auth) {
        AppUser me = users.current(auth);
        return new ModerationView(reports.open(), recipes.shared(me.getId(), 60));
    }

    @PostMapping("/reports/{id}/dismiss")
    public ModerationView dismiss(@PathVariable UUID id, Authentication auth) {
        AppUser me = users.current(auth);
        ReportDto r = reports.dismiss(id, me.getId());
        audit.record(me, Action.REPORT_DISMISSED, new Target(r.type(), r.targetId().toString(), label(r)), r.reason());
        return view(auth);
    }

    @PostMapping("/reports/{id}/act")
    public ModerationView act(@PathVariable UUID id, Authentication auth) {
        AppUser me = users.current(auth);
        ReportDto r = reports.act(id, me.getId());
        audit.record(me, "RECIPE".equals(r.type()) ? Action.RECIPE_HIDDEN : Action.REPORTED_PHOTO_DELETED,
                new Target(r.type(), r.targetId().toString(), label(r)), r.reason());
        return view(auth);
    }

    @PostMapping("/recipes/{id}/hide")
    public ModerationView hide(@PathVariable UUID id, Authentication auth) {
        return setHidden(id, true, auth);
    }

    @PostMapping("/recipes/{id}/restore")
    public ModerationView restore(@PathVariable UUID id, Authentication auth) {
        return setHidden(id, false, auth);
    }

    private ModerationView setHidden(UUID id, boolean hidden, Authentication auth) {
        AppUser me = users.current(auth);
        RecipeService.RecipeRow r = recipes.row(id);
        recipes.setHidden(id, hidden);
        audit.record(me, hidden ? Action.RECIPE_HIDDEN : Action.RECIPE_RESTORED, new Target("RECIPE", id.toString(), r.name()), null);
        return view(auth);
    }

    private static String label(ReportDto r) {
        return r.title() != null ? r.title() : (r.ownerName() == null ? "?" : r.ownerName()) + (r.photoDay() == null ? "" : " · " + r.photoDay());
    }
}
