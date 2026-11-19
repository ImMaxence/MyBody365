package fr.mbonnici.mybody365.shopping;

import fr.mbonnici.mybody365.shopping.ShoppingService.ShoppingList;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The shopping list (1.11), by supermarket aisle. */
@RestController
public class ShoppingController {

    public record RecipeToAdd(@NotNull UUID recipeId, @NotNull @Min(1) @Max(50) Integer servings) {}

    public record LineToAdd(@NotNull @Size(min = 1, max = 300) String name) {}

    private final ShoppingService shopping;
    private final UserService users;

    public ShoppingController(ShoppingService shopping, UserService users) {
        this.shopping = shopping;
        this.users = users;
    }

    @GetMapping("/api/me/shopping")
    public ShoppingList list(Authentication auth) {
        return shopping.list(users.current(auth).getId());
    }

    @PostMapping("/api/me/shopping/recipes")
    public ShoppingList addRecipe(@Valid @RequestBody RecipeToAdd body, Authentication auth) {
        return shopping.addRecipe(users.current(auth).getId(), body.recipeId(), body.servings());
    }

    @PostMapping("/api/me/shopping/items")
    public ShoppingList addLine(@Valid @RequestBody LineToAdd body, Authentication auth) {
        return shopping.addLine(users.current(auth).getId(), body.name());
    }

    @PutMapping("/api/me/shopping/items/{id}")
    public ShoppingList check(@PathVariable UUID id, @RequestBody Map<String, Boolean> body, Authentication auth) {
        return shopping.setChecked(users.current(auth).getId(), id, Boolean.TRUE.equals(body.get("checked")));
    }

    @DeleteMapping("/api/me/shopping/items/{id}")
    public ShoppingList delete(@PathVariable UUID id, Authentication auth) {
        return shopping.delete(users.current(auth).getId(), id);
    }

    /** ?checked=true: what is in the basket; otherwise the whole list */
    @DeleteMapping("/api/me/shopping")
    public ShoppingList clear(@RequestParam(defaultValue = "false") boolean checked, Authentication auth) {
        return shopping.clear(users.current(auth).getId(), checked);
    }
}
