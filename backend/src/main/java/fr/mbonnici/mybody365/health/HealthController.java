package fr.mbonnici.mybody365.health;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 1.17: two optional modules, off until turned on in the profile (PATCH /api/me bpEnabled, pillsEnabled).
 * <p>
 * The blood pressure: morning and evening, each the average of 1 to 3 readings (the « rule of 3 » of home measurement:
 * three readings a minute apart, morning and evening, three days in a row), with the pulse when given; a reminder at each
 * time when not measured yet. Nothing is diagnosed: the app shows the home thresholds (135/85) and says to see a doctor
 * at once above 180/110.
 * <p>
 * The pill box: one's treatments as written (a name, a dose, the times, the days: no database of medicines, no advice),
 * the intakes ticked, a reminder at each time not ticked yet that never names the medicine on a locked screen.
 */
@RestController
public class HealthController {

    public enum Moment { MORNING, EVENING }

    /** a reading of the blood pressure monitor, in mmHg (the pulse in beats a minute) */
    public record Reading(@NotNull @Min(60) @Max(260) Integer systolic, @NotNull @Min(30) @Max(160) Integer diastolic,
            @Min(30) @Max(220) Integer pulse) {}

    public record BpInput(@NotNull @Size(min = 1, max = 3) List<@Valid @NotNull Reading> readings) {}

    /** a moment of a day: the average of its readings */
    public record BpEntry(LocalDate day, Moment moment, int systolic, int diastolic, Integer pulse, int readings) {}

    /** when the reminders go (hh:mm) */
    public record BpSettings(boolean reminder, @NotNull @Pattern(regexp = TIME) String morning, @NotNull @Pattern(regexp = TIME) String evening) {}

    public record MedInput(@NotBlank @Size(max = 60) String name, @Size(max = 40) String dose,
            @NotNull @Size(min = 1, max = 6) List<@NotNull @Pattern(regexp = TIME) String> times,
            @NotNull @Size(min = 1, max = 7) List<@NotNull @Min(1) @Max(7) Integer> days, boolean reminders) {}

    public record Medication(UUID id, String name, String dose, List<String> times, List<Integer> days, boolean reminders) {}

    /** an intake of the day: a medicine at one of its times */
    public record Intake(UUID medicationId, String slot, boolean taken, Instant takenAt) {}

    public record PillBox(List<Medication> items, LocalDate day, List<Intake> intakes) {}

    public record IntakeInput(@NotNull LocalDate day, @NotNull @Pattern(regexp = TIME) String slot, boolean taken) {}

    static final String TIME = "([01]\\d|2[0-3]):[0-5]\\d";
    /** treatments of one's own, at most */
    static final int MAX_MEDS = 20;

    private final JdbcTemplate jdbc;
    private final UserService users;

    public HealthController(JdbcTemplate jdbc, UserService users) {
        this.jdbc = jdbc;
        this.users = users;
    }

    // ── the blood pressure ────────────────────────────────────────────────

    @GetMapping("/api/me/bp")
    public List<BpEntry> bp(@RequestParam(defaultValue = "90") int days, Authentication auth) {
        UUID me = users.current(auth).getId();
        LocalDate from = TrackingService.today().minusDays(Math.clamp(days, 1, 400) - 1L);
        return jdbc.query("""
                select day, moment, systolic, diastolic, pulse, readings from bp_log where user_id = ? and day >= ?
                order by day, moment desc""", (rs, i) -> new BpEntry(rs.getDate("day").toLocalDate(), Moment.valueOf(rs.getString("moment")),
                rs.getInt("systolic"), rs.getInt("diastolic"), (Integer) rs.getObject("pulse"), rs.getInt("readings")), me, from);
    }

    /** the average of the readings (rounded), the pulse of those that give it */
    @PutMapping("/api/me/bp/{day}/{moment}")
    public BpEntry saveBp(@PathVariable LocalDate day, @PathVariable Moment moment, @Valid @RequestBody BpInput in, Authentication auth) {
        UUID me = users.current(auth).getId();
        checkDay(day, 366);
        for (Reading r : in.readings()) {
            if (r.systolic() <= r.diastolic()) {
                throw ApiException.badRequest("bp_invalid");
            }
        }
        int sys = (int) Math.round(in.readings().stream().mapToInt(Reading::systolic).average().orElse(0));
        int dia = (int) Math.round(in.readings().stream().mapToInt(Reading::diastolic).average().orElse(0));
        List<Integer> pulses = in.readings().stream().map(Reading::pulse).filter(java.util.Objects::nonNull).toList();
        Integer pulse = pulses.isEmpty() ? null : (int) Math.round(pulses.stream().mapToInt(Integer::intValue).average().orElse(0));
        jdbc.update("""
                insert into bp_log (user_id, day, moment, systolic, diastolic, pulse, readings, measured_at) values (?, ?, ?, ?, ?, ?, ?, now())
                on conflict (user_id, day, moment) do update set systolic = excluded.systolic, diastolic = excluded.diastolic,
                  pulse = excluded.pulse, readings = excluded.readings, measured_at = now()""",
                me, day, moment.name(), sys, dia, pulse, in.readings().size());
        return new BpEntry(day, moment, sys, dia, pulse, in.readings().size());
    }

    @DeleteMapping("/api/me/bp/{day}/{moment}")
    public ResponseEntity<Void> deleteBp(@PathVariable LocalDate day, @PathVariable Moment moment, Authentication auth) {
        jdbc.update("delete from bp_log where user_id = ? and day = ? and moment = ?", users.current(auth).getId(), day, moment.name());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/me/bp/settings")
    public BpSettings bpSettings(Authentication auth) {
        UUID me = users.current(auth).getId();
        return jdbc.query("select bp_reminder, bp_morning, bp_evening from notification_pref where user_id = ?",
                (rs, i) -> new BpSettings(rs.getBoolean("bp_reminder"), hhmm(rs.getTime("bp_morning").toLocalTime()),
                        hhmm(rs.getTime("bp_evening").toLocalTime())), me).stream().findFirst().orElse(new BpSettings(true, "07:30", "21:00"));
    }

    @PutMapping("/api/me/bp/settings")
    public BpSettings saveBpSettings(@Valid @RequestBody BpSettings in, Authentication auth) {
        UUID me = users.current(auth).getId();
        jdbc.update("insert into notification_pref (user_id) values (?) on conflict (user_id) do nothing", me);
        jdbc.update("update notification_pref set bp_reminder = ?, bp_morning = ?, bp_evening = ? where user_id = ?", in.reminder(),
                LocalTime.parse(in.morning()), LocalTime.parse(in.evening()), me);
        return bpSettings(auth);
    }

    // ── the pill box ──────────────────────────────────────────────────────

    /** the treatments, and the intakes of a day (today unless said: up to a week back) */
    @GetMapping("/api/me/medications")
    public PillBox pills(@RequestParam(required = false) LocalDate day, Authentication auth) {
        LocalDate d = day == null ? TrackingService.today() : day;
        checkDay(d, 7);
        return box(users.current(auth).getId(), d);
    }

    @PostMapping("/api/me/medications")
    @Transactional
    public ResponseEntity<PillBox> addMedication(@Valid @RequestBody MedInput in, Authentication auth) {
        AppUser user = users.current(auth);
        Integer n = jdbc.queryForObject("select count(*) from medication where user_id = ?", Integer.class, user.getId());
        if (n != null && n >= MAX_MEDS) {
            throw ApiException.conflict("too_many_medications");
        }
        jdbc.update("insert into medication (id, user_id, name, dose, times, days, reminders) values (?, ?, ?, ?, ?, ?, ?)", UUID.randomUUID(),
                user.getId(), in.name().strip(), blank(in.dose()), times(in.times()), days(in.days()), in.reminders());
        return ResponseEntity.status(HttpStatus.CREATED).body(box(user.getId(), TrackingService.today()));
    }

    @PutMapping("/api/me/medications/{id}")
    public PillBox updateMedication(@PathVariable UUID id, @Valid @RequestBody MedInput in, Authentication auth) {
        UUID me = users.current(auth).getId();
        int n = jdbc.update("update medication set name = ?, dose = ?, times = ?, days = ?, reminders = ? where id = ? and user_id = ?",
                in.name().strip(), blank(in.dose()), times(in.times()), days(in.days()), in.reminders(), id, me);
        if (n == 0) {
            throw ApiException.notFound();
        }
        return box(me, TrackingService.today());
    }

    @DeleteMapping("/api/me/medications/{id}")
    public PillBox deleteMedication(@PathVariable UUID id, Authentication auth) {
        UUID me = users.current(auth).getId();
        jdbc.update("delete from medication where id = ? and user_id = ?", id, me);
        return box(me, TrackingService.today());
    }

    /** an intake ticked (or not): one of its times, up to a week back */
    @PutMapping("/api/me/medications/{id}/intake")
    public PillBox intake(@PathVariable UUID id, @Valid @RequestBody IntakeInput in, Authentication auth) {
        UUID me = users.current(auth).getId();
        checkDay(in.day(), 7);
        List<String> times = jdbc.queryForList("select times from medication where id = ? and user_id = ?", String.class, id, me);
        if (times.isEmpty()) {
            throw ApiException.notFound();
        }
        if (!Arrays.asList(times.getFirst().split(",")).contains(in.slot())) {
            throw ApiException.badRequest("validation_failed");
        }
        LocalTime slot = LocalTime.parse(in.slot());
        if (in.taken()) {
            jdbc.update("insert into medication_intake (medication_id, day, slot, taken_at) values (?, ?, ?, ?) on conflict do nothing", id, in.day(),
                    slot, Timestamp.from(Instant.now()));
        } else {
            jdbc.update("delete from medication_intake where medication_id = ? and day = ? and slot = ?", id, in.day(), slot);
        }
        return box(me, in.day());
    }

    private PillBox box(UUID userId, LocalDate day) {
        List<Medication> meds = jdbc.query("select id, name, dose, times, days, reminders from medication where user_id = ? order by created_at",
                (rs, i) -> new Medication(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("dose"),
                        List.of(rs.getString("times").split(",")), Arrays.stream(rs.getString("days").split(",")).map(Integer::valueOf).toList(),
                        rs.getBoolean("reminders")), userId);
        Map<String, Instant> taken = new java.util.HashMap<>();
        jdbc.query("""
                select i.medication_id, i.slot, i.taken_at from medication_intake i join medication m on m.id = i.medication_id
                where m.user_id = ? and i.day = ?""", rs -> {
            taken.put(rs.getObject("medication_id", UUID.class) + " " + hhmm(rs.getTime("slot").toLocalTime()), rs.getTimestamp("taken_at").toInstant());
        }, userId, day);
        int dow = day.getDayOfWeek().getValue();
        List<Intake> intakes = new ArrayList<>();
        for (Medication m : meds) {
            if (!m.days().contains(dow)) {
                continue;
            }
            for (String t : m.times()) {
                Instant at = taken.get(m.id() + " " + t);
                intakes.add(new Intake(m.id(), t, at != null, at));
            }
        }
        intakes.sort(java.util.Comparator.comparing(Intake::slot));
        return new PillBox(meds, day, intakes);
    }

    /** a day of the past (up to {@code back} days) or today, never later */
    private static void checkDay(LocalDate day, int back) {
        LocalDate today = TrackingService.today();
        if (day.isAfter(today) || day.isBefore(today.minusDays(back))) {
            throw ApiException.badRequest("day_out_of_range");
        }
    }

    private static String times(List<String> times) {
        return String.join(",", new TreeSet<>(times));
    }

    private static String days(List<Integer> days) {
        return String.join(",", new TreeSet<>(days).stream().map(String::valueOf).toList());
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    static String hhmm(LocalTime t) {
        return String.format("%02d:%02d", t.getHour(), t.getMinute());
    }
}
