package fr.mbonnici.mybody365.meals;

import fr.mbonnici.mybody365.shopping.ShoppingService;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 1.20: the meals planned for the days to come (MealPlans) */
@RestController
public class MealPlanController {

    private final MealPlans plans;
    private final UserService users;

    public MealPlanController(MealPlans plans, UserService users) {
        this.plans = plans;
        this.users = users;
    }

    @GetMapping("/api/me/plan")
    public List<MealPlans.PlanItem> list(@RequestParam LocalDate from, @RequestParam LocalDate to, Authentication auth) {
        return plans.list(users.current(auth).getId(), from, to);
    }

    @PostMapping("/api/me/plan")
    @ResponseStatus(HttpStatus.CREATED)
    public MealPlans.PlanItem add(@RequestBody MealPlans.PlanInput body, Authentication auth) {
        return plans.add(users.current(auth).getId(), body);
    }

    @DeleteMapping("/api/me/plan/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, Authentication auth) {
        plans.delete(users.current(auth).getId(), id);
    }

    public record Range(@NotNull LocalDate from, @NotNull LocalDate to) {}

    @PostMapping("/api/me/plan/shopping")
    public ShoppingService.ShoppingList shopping(@RequestBody Range body, Authentication auth) {
        if (body.from() == null || body.to() == null) {
            throw fr.mbonnici.mybody365.common.ApiException.badRequest("invalid_day");
        }
        return plans.toShopping(users.current(auth).getId(), body.from(), body.to());
    }
}
