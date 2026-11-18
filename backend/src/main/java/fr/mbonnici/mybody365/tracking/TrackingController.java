package fr.mbonnici.mybody365.tracking;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.tracking.TrackingDtos.LogDto;
import fr.mbonnici.mybody365.tracking.TrackingDtos.LogInput;
import fr.mbonnici.mybody365.tracking.TrackingDtos.ProfileInput;
import fr.mbonnici.mybody365.tracking.TrackingDtos.Summary;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The account's own tracking: body profile, daily log, summary. */
@RestController
@RequestMapping("/api/me")
public class TrackingController {

    private final TrackingService tracking;
    private final UserService users;

    private final Milestones milestones;

    public TrackingController(TrackingService tracking, UserService users, Milestones milestones) {
        this.milestones = milestones;
        this.tracking = tracking;
        this.users = users;
    }

    /** 404 until the onboarding has been filled in */
    @GetMapping("/summary")
    public Summary summary(Authentication auth) {
        return tracking.summary(users.current(auth).getId());
    }

    public record MacrosInput(@NotNull MacroSplit split) {}

    public record AdaptiveInput(boolean on) {}

    /** the target from the real needs (meals and weigh-ins of the last weeks), or from the formula */
    @PutMapping("/profile/adaptive")
    public Summary adaptive(@RequestBody AdaptiveInput body, Authentication auth) {
        AppUser user = users.current(auth);
        tracking.setAdaptive(user.getId(), body.on());
        return tracking.summary(user.getId());
    }

    /** the split of the macros: balanced, more protein, fewer carbohydrates */
    @PutMapping("/profile/macros")
    public Summary macros(@Valid @RequestBody MacrosInput body, Authentication auth) {
        AppUser user = users.current(auth);
        tracking.setMacroSplit(user.getId(), body.split());
        return tracking.summary(user.getId());
    }

    @PutMapping("/profile")
    public Summary saveProfile(@Valid @RequestBody ProfileInput body, Authentication auth) {
        AppUser user = users.current(auth);
        tracking.saveProfile(user.getId(), body);
        return tracking.summary(user.getId());
    }

    @GetMapping("/logs")
    public List<LogDto> logs(Authentication auth) {
        return tracking.history(users.current(auth).getId());
    }

    /** create or replace the log of a day (yyyy-mm-dd) */
    @PutMapping("/logs/{day}")
    public Summary saveLog(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day,
            @Valid @RequestBody LogInput body, Authentication auth) {
        AppUser user = users.current(auth);
        requireProfile(user);
        tracking.saveLog(user.getId(), day, body);
        milestones.markReached(user.getId());
        return tracking.summary(user.getId());
    }

    public record EveningInput(@jakarta.validation.constraints.NotNull @jakarta.validation.constraints.DecimalMin("30") @jakarta.validation.constraints.DecimalMax("350")
            java.math.BigDecimal weightKg) {}

    /** the optional evening weigh-in of a day (1.9) */
    @PutMapping("/logs/{day}/evening")
    public Summary saveEvening(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day, @Valid @RequestBody EveningInput body,
            Authentication auth) {
        AppUser user = users.current(auth);
        requireProfile(user);
        tracking.saveEvening(user.getId(), day, body.weightKg());
        return tracking.summary(user.getId());
    }

    @DeleteMapping("/logs/{day}/evening")
    public Summary deleteEvening(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day, Authentication auth) {
        AppUser user = users.current(auth);
        requireProfile(user);
        tracking.saveEvening(user.getId(), day, null);
        return tracking.summary(user.getId());
    }

    @DeleteMapping("/logs/{day}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteLog(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day, Authentication auth) {
        tracking.deleteLog(users.current(auth).getId(), day);
    }

    private void requireProfile(AppUser user) {
        if (!tracking.hasProfile(user.getId())) {
            throw ApiException.conflict("profile_missing");
        }
    }
}
