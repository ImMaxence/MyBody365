package fr.mbonnici.mybody365.recipe;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.recipe.RecipeService.RecipeDto;
import fr.mbonnici.mybody365.recipe.RecipeService.RecipeInput;
import fr.mbonnici.mybody365.recipe.RecipeService.RecipeRow;
import fr.mbonnici.mybody365.recipe.RecipeService.Type;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
import org.springframework.web.multipart.MultipartFile;

@RestController
public class RecipeController {

    private final RecipeService recipes;
    private final UserService users;
    private final RecipeImporter importer;

    public RecipeController(RecipeService recipes, UserService users, RecipeImporter importer) {
        this.importer = importer;
        this.recipes = recipes;
        this.users = users;
    }

    @GetMapping("/api/me/recipes")
    public List<RecipeDto> mine(Authentication auth) {
        return recipes.mine(users.current(auth).getId());
    }

    @PostMapping("/api/me/recipes")
    @ResponseStatus(HttpStatus.CREATED)
    public RecipeDto create(@Valid @RequestBody RecipeInput body, Authentication auth) {
        AppUser me = users.current(auth);
        communityCheck(me, body);
        return recipes.create(me.getId(), body);
    }

    @PutMapping("/api/me/recipes/{id}")
    public RecipeDto update(@PathVariable UUID id, @Valid @RequestBody RecipeInput body, Authentication auth) {
        AppUser me = users.current(auth);
        communityCheck(me, body);
        return recipes.update(me.getId(), id, body);
    }

    /**
     * The community (every member sees it) is published by the admins only: a member's recipe stays private or goes to
     * their friends, so that nobody can show everyone a shocking photo or an unlawful text.
     */
    private void communityCheck(AppUser me, RecipeInput body) {
        if (body.resolved() == RecipeService.Visibility.PUBLIC && !users.isAdmin(me)) {
            throw ApiException.badRequest("community_admins_only");
        }
    }

    /** who sees it, without the rest of the recipe (the community stays the admins') */
    @PutMapping("/api/me/recipes/{id}/visibility")
    public RecipeDto visibility(@PathVariable UUID id, @RequestBody Map<String, String> body, Authentication auth) {
        AppUser me = users.current(auth);
        RecipeService.Visibility v;
        try {
            v = RecipeService.Visibility.valueOf(String.valueOf(body.get("visibility")));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("validation_failed");
        }
        if (v == RecipeService.Visibility.PUBLIC && !users.isAdmin(me)) {
            throw ApiException.badRequest("community_admins_only");
        }
        return recipes.setVisibility(me.getId(), id, v);
    }

    @DeleteMapping("/api/me/recipes/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, Authentication auth) {
        recipes.delete(users.current(auth).getId(), id);
    }

    @PostMapping(value = "/api/me/recipes/{id}/image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public RecipeDto setImage(@PathVariable UUID id, @RequestParam("file") MultipartFile file, Authentication auth) throws IOException {
        return recipes.setImage(users.current(auth).getId(), id, file.getBytes());
    }

    @DeleteMapping("/api/me/recipes/{id}/image")
    public RecipeDto deleteImage(@PathVariable UUID id, Authentication auth) {
        return recipes.deleteImage(users.current(auth).getId(), id);
    }

    @GetMapping("/api/recipes/community")
    public List<RecipeDto> community(@RequestParam(required = false) Type type, @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "top") String sort,
            @RequestParam(defaultValue = "0") int page, Authentication auth) {
        return recipes.community(users.current(auth).getId(), type, "new".equals(sort), page, q);
    }

    /** a draft read from a recipe site (nothing saved): the app fills its form with it */
    @PostMapping("/api/me/recipes/import")
    public RecipeImporter.Draft importRecipe(@RequestBody Map<String, String> body, Authentication auth) {
        return importer.read(body.get("url"), users.current(auth).getId());
    }

    /** the recipes my friends show to their friends (or to everyone) */
    @GetMapping("/api/recipes/friends")
    public List<RecipeDto> friends(@RequestParam(required = false) Type type, Authentication auth) {
        return recipes.ofFriends(users.current(auth).getId(), type);
    }

    @GetMapping("/api/recipes/{id}")
    public RecipeDto get(@PathVariable UUID id, Authentication auth) {
        AppUser me = users.current(auth);
        return recipes.dto(recipes.viewable(id, me.getId(), users.isAdmin(me)), me.getId(), true);
    }

    @PostMapping("/api/recipes/{id}/vote")
    public RecipeDto vote(@PathVariable UUID id, @RequestBody Map<String, Integer> body, Authentication auth) {
        Integer value = body.get("value");
        if (value == null || value < -1 || value > 1) {
            throw ApiException.badRequest("validation_failed");
        }
        return recipes.vote(users.current(auth).getId(), id, value);
    }

    @PostMapping("/api/recipes/{id}/copy")
    @ResponseStatus(HttpStatus.CREATED)
    public RecipeDto copy(@PathVariable UUID id, Authentication auth) {
        return recipes.copy(users.current(auth).getId(), id);
    }

    /** the picture of a recipe; the URL carries its version, so the browser may keep it */
    @GetMapping("/api/recipes/{id}/image/{variant}")
    public ResponseEntity<byte[]> image(@PathVariable UUID id, @PathVariable String variant, Authentication auth) {
        if (!"full".equals(variant) && !"thumb".equals(variant)) {
            throw ApiException.notFound();
        }
        AppUser me = users.current(auth);
        RecipeRow r = recipes.viewable(id, me.getId(), users.isAdmin(me));
        byte[] bytes = recipes.image(r, "thumb".equals(variant));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("webp".equals(r.imageFormat()) ? "image/webp" : "image/jpeg"))
                .cacheControl(CacheControl.maxAge(30, TimeUnit.DAYS).cachePrivate())
                .body(bytes);
    }
}
