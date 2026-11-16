package fr.mbonnici.mybody365.nutrition;

import fr.mbonnici.mybody365.nutrition.FoodService.FoodDto;
import fr.mbonnici.mybody365.nutrition.FoodService.FoodInput;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class FoodController {

    private final FoodService foods;
    private final UserService users;

    public FoodController(FoodService foods, UserService users) {
        this.foods = foods;
        this.users = users;
    }

    /** source=local: the account's foods, Ciqual and known products; source=off: Open Food Facts, live */
    @GetMapping("/api/foods/search")
    public List<FoodDto> search(@RequestParam String q, @RequestParam(defaultValue = "local") String source, Authentication auth) {
        UUID me = users.current(auth).getId();
        String query = q.length() > 80 ? q.substring(0, 80) : q;
        return "off".equals(source) ? foods.searchOff(me, query) : foods.searchLocal(me, query);
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

    @GetMapping("/api/me/foods")
    public List<FoodDto> mine(Authentication auth) {
        return foods.mine(users.current(auth).getId());
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
