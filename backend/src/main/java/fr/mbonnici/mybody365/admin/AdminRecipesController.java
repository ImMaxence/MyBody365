package fr.mbonnici.mybody365.admin;

import fr.mbonnici.mybody365.recipe.RecipeService;
import fr.mbonnici.mybody365.user.UserService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 1.14: « Recettes »: the community's recipes for the admins, by name, without a photo or hidden. They are changed with the
 * recipe editor of the app (an admin may change a community recipe, RecipeService.update), hidden and shown again with
 * the moderation's /api/admin/recipes/{id}/hide and /restore.
 */
@RestController
@RequestMapping("/api/admin/recipes")
public class AdminRecipesController {

    private final RecipeService recipes;
    private final UserService users;

    public AdminRecipesController(RecipeService recipes, UserService users) {
        this.recipes = recipes;
        this.users = users;
    }

    @GetMapping
    public RecipeService.AdminList list(@RequestParam(required = false) String q, @RequestParam(defaultValue = "all") String filter,
            @RequestParam(defaultValue = "0") int page, Authentication auth) {
        return recipes.adminCommunity(users.current(auth).getId(), q, filter, page);
    }
}
