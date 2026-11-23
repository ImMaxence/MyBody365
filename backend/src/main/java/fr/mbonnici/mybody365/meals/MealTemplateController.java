package fr.mbonnici.mybody365.meals;

import fr.mbonnici.mybody365.meals.MealTemplates.TemplateDto;
import fr.mbonnici.mybody365.meals.MealTemplates.TemplateInput;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 1.19: « Mes repas habituels » (MealTemplates) */
@RestController
@RequestMapping("/api/me/meal-templates")
public class MealTemplateController {

    private final MealTemplates templates;
    private final UserService users;

    public MealTemplateController(MealTemplates templates, UserService users) {
        this.templates = templates;
        this.users = users;
    }

    @GetMapping
    public List<TemplateDto> list(Authentication auth) {
        return templates.list(users.current(auth).getId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TemplateDto save(@Valid @RequestBody TemplateInput body, Authentication auth) {
        return templates.save(users.current(auth).getId(), body);
    }

    @PostMapping("/{id}/used")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void used(@PathVariable UUID id, Authentication auth) {
        templates.used(users.current(auth).getId(), id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, Authentication auth) {
        templates.delete(users.current(auth).getId(), id);
    }
}
