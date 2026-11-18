package fr.mbonnici.mybody365.meals;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.nutrition.FoodService;
import fr.mbonnici.mybody365.nutrition.FoodService.FoodDto;
import fr.mbonnici.mybody365.recipe.RecipeService;
import fr.mbonnici.mybody365.recipe.RecipeService.RecipeDto;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.UserService;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Favourites (1.9): foods (Ciqual, Open Food Facts, one's own) and recipes kept at the top of « Ajouter un repas », to add
 * in one tap. Only what the member can still see comes back: a friend's recipe no longer shared, a food deleted, fall out.
 */
@RestController
public class FavoriteController {

    /** enough for a whole fridge, not a copy of the tables */
    static final int MAX = 200;

    public record Favorites(List<FoodDto> foods, List<RecipeDto> recipes) {}

    private final JdbcTemplate jdbc;
    private final FoodService foods;
    private final RecipeService recipes;
    private final UserService users;

    public FavoriteController(JdbcTemplate jdbc, FoodService foods, RecipeService recipes, UserService users) {
        this.jdbc = jdbc;
        this.foods = foods;
        this.recipes = recipes;
        this.users = users;
    }

    /** the newest first */
    @GetMapping("/api/me/favorites")
    public Favorites list(Authentication auth) {
        AppUser me = users.current(auth);
        UUID id = me.getId();
        List<FoodDto> f = new ArrayList<>();
        for (UUID foodId : jdbc.queryForList("select food_id from favorite where user_id = ? and food_id is not null order by created_at desc",
                UUID.class, id)) {
            try {
                f.add(foods.dto(foods.usable(foodId, id), id));
            } catch (ApiException e) {
                // no longer usable: left out
            }
        }
        boolean admin = users.isAdmin(me);
        List<RecipeDto> r = new ArrayList<>();
        for (UUID recipeId : jdbc.queryForList(
                "select recipe_id from favorite where user_id = ? and recipe_id is not null order by created_at desc", UUID.class, id)) {
            try {
                r.add(recipes.dto(recipes.viewable(recipeId, id, admin), id, false));
            } catch (ApiException e) {
                // no longer shown to me: left out
            }
        }
        return new Favorites(f, r);
    }

    @PutMapping("/api/me/favorites/foods/{foodId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void addFood(@PathVariable UUID foodId, Authentication auth) {
        UUID me = users.current(auth).getId();
        foods.usable(foodId, me);
        room(me);
        jdbc.update("insert into favorite (user_id, food_id) values (?, ?) on conflict (user_id, food_id) where food_id is not null do nothing",
                me, foodId);
    }

    @DeleteMapping("/api/me/favorites/foods/{foodId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeFood(@PathVariable UUID foodId, Authentication auth) {
        jdbc.update("delete from favorite where user_id = ? and food_id = ?", users.current(auth).getId(), foodId);
    }

    @PutMapping("/api/me/favorites/recipes/{recipeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void addRecipe(@PathVariable UUID recipeId, Authentication auth) {
        AppUser me = users.current(auth);
        recipes.viewable(recipeId, me.getId(), users.isAdmin(me));
        room(me.getId());
        jdbc.update("insert into favorite (user_id, recipe_id) values (?, ?) on conflict (user_id, recipe_id) where recipe_id is not null do nothing",
                me.getId(), recipeId);
    }

    @DeleteMapping("/api/me/favorites/recipes/{recipeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeRecipe(@PathVariable UUID recipeId, Authentication auth) {
        jdbc.update("delete from favorite where user_id = ? and recipe_id = ?", users.current(auth).getId(), recipeId);
    }

    private void room(UUID userId) {
        Integer n = jdbc.queryForObject("select count(*) from favorite where user_id = ?", Integer.class, userId);
        if (n != null && n >= MAX) {
            throw ApiException.conflict("favorites_full");
        }
    }
}
