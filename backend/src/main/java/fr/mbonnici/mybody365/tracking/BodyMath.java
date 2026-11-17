package fr.mbonnici.mybody365.tracking;

import java.time.LocalDate;
import java.time.Period;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * The numbers behind the app, as plain functions: energy needs (Mifflin-St Jeor), BMI, the smoothed
 * weight trend and the goal forecast. Estimates for information only (see the terms of use).
 */
public final class BodyMath {

    /** 1 kg of body fat ≈ 7 700 kcal */
    public static final double KCAL_PER_KG = 7700;

    /**
     * The fastest pace allowed: 1 % of the body weight a week (a common safety guide), 1 kg at most, 0.25 kg
     * at least, by steps of 0.05 kg. 60 kg → 0.60, 100 kg and more → 1.00.
     */
    public static double maxWeeklyRate(double weightKg) {
        double steps = Math.floor(weightKg * 0.01 / 0.05 + 1e-9);
        return Math.round(Math.max(0.25, Math.min(1.0, steps * 0.05)) * 100) / 100.0;
    }
    /** a healthy BMI never goes under this (goals below are refused) */
    public static final double MIN_BMI = 18.5;
    /** smoothing of the trend line (an exponential moving average, as in "The Hacker's Diet") */
    public static final double TREND_ALPHA = 0.1;

    private BodyMath() {}

    public enum Sex { FEMALE, MALE, OTHER }

    /** the day without sport: seated (office, studies, driving), standing or walking, physical work */
    public enum Job {
        SEATED(1.2), STANDING(1.35), PHYSICAL(1.55);

        public final double base;

        Job(double base) {
            this.base = base;
        }
    }

    /**
     * What a weekly session of sport (45 min to 1 h) adds to the activity factor: about 300 kcal spent over
     * the resting needs, shared over the week (300 / 7 / ~1 500 kcal of basal needs ≈ 0.03).
     */
    public static final double SESSION_FACTOR = 0.03;
    public static final int MAX_SESSIONS = 14;

    /**
     * The activity factor from the two answers: the job, plus the sessions of sport. Seated with 3 sessions a
     * week → 1.29, nearer « light » (1.375) than « moderate » (1.55): the usual levels count the sessions as if
     * the whole day were active, and overestimate the needs of most people.
     */
    public static double activityFactor(Job job, int sessionsPerWeek) {
        return job.base + SESSION_FACTOR * Math.clamp(sessionsPerWeek, 0, MAX_SESSIONS);
    }

    /** the level nearest to a factor (kept with the two answers, for the older apps and the backups) */
    public static Activity nearest(double factor) {
        Activity best = Activity.SEDENTARY;
        for (Activity a : Activity.values()) {
            if (Math.abs(a.factor - factor) < Math.abs(best.factor - factor)) {
                best = a;
            }
        }
        return best;
    }

    public enum Activity {
        SEDENTARY(1.2), LIGHT(1.375), MODERATE(1.55), ACTIVE(1.725), VERY_ACTIVE(1.9);

        public final double factor;

        Activity(double factor) {
            this.factor = factor;
        }
    }

    public record Point(LocalDate day, double weightKg) {}

    public static int age(LocalDate birthDate, LocalDate today) {
        return Period.between(birthDate, today).getYears();
    }

    public static double bmi(double weightKg, double heightCm) {
        double m = heightCm / 100;
        return weightKg / (m * m);
    }

    /** the lowest weight a goal may have: a BMI of 18.5 */
    public static double minHealthyWeight(double heightCm) {
        double m = heightCm / 100;
        return MIN_BMI * m * m;
    }

    /** basal metabolic rate, Mifflin-St Jeor (the average of both formulas for OTHER) */
    public static double bmr(Sex sex, double weightKg, double heightCm, int age) {
        double base = 10 * weightKg + 6.25 * heightCm - 5 * age;
        return switch (sex) {
            case MALE -> base + 5;
            case FEMALE -> base - 161;
            case OTHER -> base - 78;
        };
    }

    public static double tdee(double bmr, Activity activity) {
        return bmr * activity.factor;
    }

    /** the daily intake that never goes lower, whatever the goal */
    public static int kcalFloor(Sex sex) {
        return switch (sex) {
            case MALE -> 1500;
            case FEMALE -> 1200;
            case OTHER -> 1350;
        };
    }

    /**
     * The daily calorie target for a change of {@code weeklyRateKg} towards the goal (a deficit to
     * lose, a surplus to gain), never under the floor.
     */
    public static int targetKcal(double tdee, double weeklyRateKg, boolean losing, Sex sex) {
        double daily = weeklyRateKg * KCAL_PER_KG / 7;
        double target = losing ? tdee - daily : tdee + daily;
        return (int) Math.round(Math.max(target, kcalFloor(sex)));
    }

    /** the smoothed trend of the weigh-ins (one value per point, same order) */
    public static List<Double> trend(List<Point> points) {
        List<Double> out = new ArrayList<>(points.size());
        Double t = null;
        for (Point p : points) {
            t = t == null ? p.weightKg() : t + TREND_ALPHA * (p.weightKg() - t);
            out.add(t);
        }
        return out;
    }

    /**
     * Speed of the real trend in kg per day, by least squares over the points of the last
     * {@code windowDays}; null when there is not enough data (5 weigh-ins spread over a week).
     */
    public static Double slopePerDay(List<Point> points, LocalDate today, int windowDays) {
        LocalDate from = today.minusDays(windowDays);
        List<Point> recent = points.stream().filter(p -> !p.day().isBefore(from)).toList();
        if (recent.size() < 5) {
            return null;
        }
        long span = ChronoUnit.DAYS.between(recent.getFirst().day(), recent.getLast().day());
        if (span < 7) {
            return null;
        }
        double n = recent.size();
        double sx = 0;
        double sy = 0;
        double sxy = 0;
        double sxx = 0;
        for (Point p : recent) {
            double x = ChronoUnit.DAYS.between(from, p.day());
            sx += x;
            sy += p.weightKg();
            sxy += x * p.weightKg();
            sxx += x * x;
        }
        double denominator = n * sxx - sx * sx;
        return denominator == 0 ? null : (n * sxy - sx * sy) / denominator;
    }

    /**
     * When the goal is reached at {@code kgPerDay} (signed), or null when that speed goes the wrong
     * way or is too slow to mean anything (more than three years).
     */
    public static LocalDate eta(double currentKg, double goalKg, double kgPerDay, LocalDate today) {
        double remaining = goalKg - currentKg;
        if (Math.abs(remaining) < 0.05) {
            return today;
        }
        if (kgPerDay == 0 || Math.signum(kgPerDay) != Math.signum(remaining)) {
            return null;
        }
        // the epsilon keeps 20.000000001 days (floating point) at 20
        long days = (long) Math.ceil(remaining / kgPerDay - 1e-9);
        return days > 3 * 365 ? null : today.plusDays(days);
    }
}
