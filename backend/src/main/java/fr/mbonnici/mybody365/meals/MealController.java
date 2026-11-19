package fr.mbonnici.mybody365.meals;

import fr.mbonnici.mybody365.meals.MealService.CopyInput;
import fr.mbonnici.mybody365.meals.MealService.DayDto;
import fr.mbonnici.mybody365.meals.MealService.DaysDto;
import fr.mbonnici.mybody365.meals.MealService.MealInput;
import fr.mbonnici.mybody365.meals.MealService.MealUpdate;
import fr.mbonnici.mybody365.meals.MealService.RecentDto;
import fr.mbonnici.mybody365.meals.MealService.StatsDto;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me/meals")
public class MealController {

    private final MealService meals;
    private final UserService users;

    public MealController(MealService meals, UserService users) {
        this.meals = meals;
        this.users = users;
    }

    @GetMapping
    public DayDto day(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day,
            Authentication auth) {
        return meals.day(users.current(auth).getId(), day == null ? TrackingService.today() : day);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DayDto add(@Valid @RequestBody MealInput body, Authentication auth) {
        return meals.add(users.current(auth).getId(), body);
    }

    @PatchMapping("/{id}")
    public DayDto update(@PathVariable UUID id, @Valid @RequestBody MealUpdate body, Authentication auth) {
        return meals.update(users.current(auth).getId(), id, body);
    }

    @DeleteMapping("/{id}")
    public DayDto delete(@PathVariable UUID id, Authentication auth) {
        return meals.delete(users.current(auth).getId(), id);
    }

    @PostMapping("/copy")
    public DayDto copy(@Valid @RequestBody CopyInput body, Authentication auth) {
        return meals.copy(users.current(auth).getId(), body);
    }

    /** the totals of each day of a range: the calendar */
    @GetMapping("/days")
    public DaysDto days(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to, Authentication auth) {
        return meals.days(users.current(auth).getId(), from, to);
    }

    @GetMapping("/stats")
    public StatsDto stats(@RequestParam(defaultValue = "30") int days, Authentication auth) {
        return meals.stats(users.current(auth).getId(), days);
    }

    /** 1.14: the vitamins and minerals of the last days, and those that run low */
    @GetMapping("/micros")
    public MealService.MicrosDto micros(@RequestParam(defaultValue = "7") int days, Authentication auth) {
        return meals.micros(users.current(auth).getId(), days);
    }

    @GetMapping("/recent")
    public List<RecentDto> recent(Authentication auth) {
        return meals.recent(users.current(auth).getId());
    }
}
