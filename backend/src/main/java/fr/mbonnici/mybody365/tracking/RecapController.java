package fr.mbonnici.mybody365.tracking;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.tracking.MonthlyRecap.Recap;
import fr.mbonnici.mybody365.user.UserService;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 1.19: the recap of a month (MonthlyRecap); the month before by default */
@RestController
public class RecapController {

    private final MonthlyRecap recaps;
    private final UserService users;

    public RecapController(MonthlyRecap recaps, UserService users) {
        this.recaps = recaps;
        this.users = users;
    }

    @GetMapping("/api/me/recap")
    public Recap recap(@RequestParam(required = false) String month, Authentication auth) {
        YearMonth m;
        try {
            m = month == null || month.isBlank() ? YearMonth.from(TrackingService.today()).minusMonths(1) : YearMonth.parse(month);
        } catch (DateTimeParseException e) {
            throw ApiException.badRequest("invalid_month");
        }
        return recaps.recap(users.current(auth).getId(), m);
    }
}
