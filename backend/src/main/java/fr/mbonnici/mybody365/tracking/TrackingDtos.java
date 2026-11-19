package fr.mbonnici.mybody365.tracking;

import fr.mbonnici.mybody365.tracking.BodyMath.Activity;
import fr.mbonnici.mybody365.tracking.BodyMath.Job;
import fr.mbonnici.mybody365.tracking.BodyMath.Sex;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class TrackingDtos {

    private TrackingDtos() {}

    public record ProfileInput(
            @NotNull Sex sex,
            @NotNull @Past LocalDate birthDate,
            @NotNull @DecimalMin("100") @DecimalMax("250") BigDecimal heightCm,
            /** the level of an app older than 1.7; the newer ones give the job and the sessions instead */
            Activity activityLevel,
            Job job,
            @Min(0) @Max(14) Integer sessionsPerWeek,
            /** today's weight: the starting point on the first save */
            @NotNull @DecimalMin("30") @DecimalMax("350") BigDecimal currentWeightKg,
            @NotNull @DecimalMin("30") @DecimalMax("350") BigDecimal goalWeightKg,
            @NotNull @DecimalMin("0.25") @DecimalMax("1.0") BigDecimal weeklyRateKg,
            /** 1.14: the starting point, changed from « Mon objectif » (null: kept); the weigh-ins do not change */
            @DecimalMin("30") @DecimalMax("350") BigDecimal startWeightKg) {}

    public record ProfileDto(
            Sex sex,
            LocalDate birthDate,
            int age,
            double heightCm,
            Activity activityLevel,
            /** the two answers (null on a profile saved before 1.7) and the factor they give */
            Job job,
            Integer sessionsPerWeek,
            double activityFactor,
            MacroSplit macroSplit,
            boolean adaptiveTdee,
            double startWeightKg,
            LocalDate startDate,
            double goalWeightKg,
            double weeklyRateKg,
            /** the lowest goal allowed for this height (BMI 18.5) */
            double minGoalKg) {}

    public record LogInput(
            @DecimalMin("30") @DecimalMax("350") BigDecimal weightKg,
            @DecimalMin("2") @DecimalMax("70") BigDecimal bodyFatPct,
            @DecimalMin("20") @DecimalMax("250") BigDecimal waistCm,
            @DecimalMin("20") @DecimalMax("250") BigDecimal hipsCm,
            @DecimalMin("20") @DecimalMax("250") BigDecimal chestCm,
            @DecimalMin("10") @DecimalMax("100") BigDecimal armCm,
            @DecimalMin("10") @DecimalMax("150") BigDecimal thighCm,
            @Size(max = 200) String note) {}

    public record LogDto(
            LocalDate day,
            Double weightKg,
            Double trendKg,
            Double bodyFatPct,
            Double waistCm,
            Double hipsCm,
            Double chestCm,
            Double armCm,
            Double thighCm,
            String note,
            /** the optional evening weigh-in (1.9) */
            Double eveningKg) {}

    /** eveningKg: the evening weigh-in of that day, if any (1.9) */
    public record Current(Double weightKg, LocalDate day, Double trendKg, Double bmi, Double changeKg, Double eveningKg) {}

    /**
     * tdee: the needs the target counts on; estimatedTdee: the formula's (Mifflin-St Jeor × activity);
     * realTdee: from the member's own numbers over the last weeks, when there are enough (realDays: how many);
     * adaptive: the member chose to count on the real one.
     */
    public record Energy(int bmr, int tdee, int targetKcal, boolean floorApplied, int estimatedTdee, Integer realTdee, Integer realDays,
            boolean adaptive) {}

    public record Goal(
            double goalKg,
            double remainingKg,
            int progressPct,
            boolean reached,
            /** at the chosen pace */
            LocalDate planDate,
            /** at the real pace of the last four weeks, when there is enough data */
            LocalDate trendDate,
            Double trendKgPerWeek) {}

    public record Day(LocalDate day, boolean done, boolean future, boolean frozen) {}

    /**
     * week: Monday to Sunday of the current week; calendar: the last 28 days (oldest first);
     * freezes: in stock (one every 7 days in a row, 2 at most), used up by a missed day.
     */
    public record Streak(int days, boolean todayDone, List<Day> week, int best, int freezes, List<Day> calendar) {}

    public record Summary(ProfileDto profile, Current current, Energy energy, Goal goal, Streak streak, List<String> warnings) {}
}
