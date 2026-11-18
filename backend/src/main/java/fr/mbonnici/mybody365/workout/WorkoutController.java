package fr.mbonnici.mybody365.workout;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
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
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Workout sessions. The programmes themselves live in the app (texts in both languages); the server
 * keeps what was done: which workout, the sets of each exercise, the weights, the duration. Since 1.9 the app no
 * longer notes sessions (the timer is a timer, nothing more): the sessions noted before stay readable and go with the
 * backups.
 */
@RestController
@RequestMapping("/api/me/workouts")
public class WorkoutController {

    public record ExerciseLog(
            @NotNull @Pattern(regexp = "[a-z0-9-]{1,40}") String id,
            @Min(0) @Max(20) int sets,
            @DecimalMin("0") @DecimalMax("500") Double weightKg) {}

    public record SessionInput(
            @NotNull LocalDate day,
            @NotNull @Pattern(regexp = "[a-z0-9-]{1,40}") String program,
            @NotNull @Pattern(regexp = "[a-z0-9-]{1,40}") String workout,
            @Min(1) @Max(600) Integer durationMin,
            @NotNull @Size(max = 30) List<@Valid ExerciseLog> exercises,
            @Size(max = 500) String note) {}

    public record SessionDto(UUID id, LocalDate day, String program, String workout, Integer durationMin, List<ExerciseLog> exercises,
            String note, Instant createdAt) {}

    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final UserService users;

    public WorkoutController(JdbcTemplate jdbc, JsonMapper json, UserService users) {
        this.jdbc = jdbc;
        this.json = json;
        this.users = users;
    }

    @GetMapping
    public List<SessionDto> list(Authentication auth) {
        return jdbc.query("""
                select id, day, program, workout, duration_min, exercises, note, created_at from workout_session
                where user_id = ? order by day desc, created_at desc limit 100""", (rs, i) -> {
            int d = rs.getInt("duration_min");
            Integer duration = rs.wasNull() ? null : d;
            return new SessionDto(rs.getObject("id", UUID.class), rs.getObject("day", LocalDate.class), rs.getString("program"),
                    rs.getString("workout"), duration, json.readValue(rs.getString("exercises"), new TypeReference<List<ExerciseLog>>() {}),
                    rs.getString("note"), rs.getTimestamp("created_at").toInstant());
        }, users.current(auth).getId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public List<SessionDto> add(@Valid @RequestBody SessionInput in, Authentication auth) {
        LocalDate today = TrackingService.today();
        if (in.day().isAfter(today.plusDays(1)) || in.day().isBefore(today.minusYears(2))) {
            throw ApiException.badRequest("invalid_day");
        }
        jdbc.update("""
                insert into workout_session (id, user_id, day, program, workout, duration_min, exercises, note)
                values (?, ?, ?, ?, ?, ?, ?, ?)""",
                UUID.randomUUID(), users.current(auth).getId(), in.day(), in.program(), in.workout(), in.durationMin(),
                json.writeValueAsString(in.exercises()), in.note() == null || in.note().isBlank() ? null : in.note().strip());
        return list(auth);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, Authentication auth) {
        int n = jdbc.update("delete from workout_session where id = ? and user_id = ?", id, users.current(auth).getId());
        if (n == 0) {
            throw ApiException.notFound();
        }
    }
}
