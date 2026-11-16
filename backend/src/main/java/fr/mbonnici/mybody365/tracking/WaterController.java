package fr.mbonnici.mybody365.tracking;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Glasses of water (250 ml), day by day: an optional tracker, on once a goal is set in the profile. */
@RestController
@RequestMapping("/api/me/water")
public class WaterController {

    public static final int GLASS_ML = 250;

    public record WaterDay(LocalDate day, int glasses, Integer goal) {}

    public record WaterInput(@NotNull @Min(0) @Max(40) Integer glasses) {}

    private final JdbcTemplate jdbc;
    private final UserService users;

    public WaterController(JdbcTemplate jdbc, UserService users) {
        this.jdbc = jdbc;
        this.users = users;
    }

    @GetMapping("/{day}")
    public WaterDay day(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day, Authentication auth) {
        AppUser me = users.current(auth);
        return read(me.getId(), day, me.getWaterGoal());
    }

    @PutMapping("/{day}")
    public WaterDay set(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day, @Valid @RequestBody WaterInput body,
            Authentication auth) {
        AppUser me = users.current(auth);
        LocalDate today = TrackingService.today();
        if (day.isAfter(today.plusDays(1)) || day.isBefore(today.minusYears(2))) {
            throw ApiException.badRequest("invalid_day");
        }
        if (body.glasses() == 0) {
            jdbc.update("delete from water_log where user_id = ? and day = ?", me.getId(), day);
        } else {
            jdbc.update("""
                    insert into water_log (user_id, day, glasses) values (?, ?, ?)
                    on conflict (user_id, day) do update set glasses = excluded.glasses""", me.getId(), day, body.glasses());
        }
        return read(me.getId(), day, me.getWaterGoal());
    }

    private WaterDay read(UUID userId, LocalDate day, Integer goal) {
        Integer glasses = jdbc.queryForList("select glasses from water_log where user_id = ? and day = ?", Integer.class, userId, day).stream()
                .findFirst().orElse(0);
        return new WaterDay(day, glasses, goal);
    }
}
