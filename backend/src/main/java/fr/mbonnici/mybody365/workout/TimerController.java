package fr.mbonnici.mybody365.workout;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The timers a member saves under a name (effort, rest, rounds), on every device of the account. */
@RestController
@RequestMapping("/api/me/timers")
public class TimerController {

    static final int MAX_PER_ACCOUNT = 20;

    public record Timer(UUID id, String name, int work, int rest, int rounds) {}

    public record TimerInput(
            @NotBlank @Size(max = 30) String name,
            @NotNull @Min(5) @Max(3600) Integer work,
            @NotNull @Min(0) @Max(600) Integer rest,
            @NotNull @Min(1) @Max(30) Integer rounds) {}

    private final JdbcTemplate jdbc;
    private final UserService users;

    public TimerController(JdbcTemplate jdbc, UserService users) {
        this.jdbc = jdbc;
        this.users = users;
    }

    @GetMapping
    public List<Timer> list(Authentication auth) {
        return list(users.current(auth).getId());
    }

    private List<Timer> list(UUID userId) {
        return jdbc.query("select id, name, work_s, rest_s, rounds from timer_preset where user_id = ? order by created_at",
                (rs, i) -> new Timer(rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("work_s"), rs.getInt("rest_s"),
                        rs.getInt("rounds")),
                userId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public List<Timer> save(@Valid @RequestBody TimerInput in, Authentication auth) {
        UUID me = users.current(auth).getId();
        String name = in.name().strip();
        if (name.isEmpty()) {
            throw ApiException.badRequest("validation_failed");
        }
        Integer count = jdbc.queryForObject("select count(*) from timer_preset where user_id = ?", Integer.class, me);
        if (count != null && count >= MAX_PER_ACCOUNT) {
            throw ApiException.conflict("too_many_timers");
        }
        jdbc.update("insert into timer_preset (id, user_id, name, work_s, rest_s, rounds) values (?, ?, ?, ?, ?, ?)", UUID.randomUUID(), me,
                name, in.work(), in.rest(), in.rounds());
        return list(me);
    }

    @DeleteMapping("/{id}")
    public List<Timer> delete(@PathVariable UUID id, Authentication auth) {
        UUID me = users.current(auth).getId();
        if (jdbc.update("delete from timer_preset where id = ? and user_id = ?", id, me) == 0) {
            throw ApiException.notFound();
        }
        return list(me);
    }
}
