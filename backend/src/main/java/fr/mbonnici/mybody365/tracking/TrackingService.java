package fr.mbonnici.mybody365.tracking;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.tracking.BodyMath.Point;
import fr.mbonnici.mybody365.tracking.TrackingDtos.Current;
import fr.mbonnici.mybody365.tracking.TrackingDtos.Day;
import fr.mbonnici.mybody365.tracking.TrackingDtos.Energy;
import fr.mbonnici.mybody365.tracking.TrackingDtos.Goal;
import fr.mbonnici.mybody365.tracking.TrackingDtos.LogDto;
import fr.mbonnici.mybody365.tracking.TrackingDtos.LogInput;
import fr.mbonnici.mybody365.tracking.TrackingDtos.ProfileDto;
import fr.mbonnici.mybody365.tracking.TrackingDtos.ProfileInput;
import fr.mbonnici.mybody365.tracking.TrackingDtos.Streak;
import fr.mbonnici.mybody365.tracking.TrackingDtos.Summary;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Body profile, daily log, and the summary of the "Today" and "Progress" screens. */
@Service
public class TrackingService {

    /** the calendar day of the users (the app is French): "today" never flips at midnight UTC */
    public static final ZoneId ZONE = ZoneId.of("Europe/Paris");

    private final BodyProfileRepository profiles;
    private final BodyLogRepository logs;
    private final JdbcTemplate jdbc;

    public TrackingService(BodyProfileRepository profiles, BodyLogRepository logs, JdbcTemplate jdbc) {
        this.profiles = profiles;
        this.logs = logs;
        this.jdbc = jdbc;
    }

    public static LocalDate today() {
        return LocalDate.now(ZONE);
    }

    public Optional<BodyProfile> profile(UUID userId) {
        return profiles.findById(userId);
    }

    public boolean hasProfile(UUID userId) {
        return profiles.existsById(userId);
    }

    /** Creates or updates the profile; the first save also records today's weigh-in. */
    @Transactional
    public BodyProfile saveProfile(UUID userId, ProfileInput in) {
        LocalDate today = today();
        if (BodyMath.age(in.birthDate(), today) < 18) {
            throw ApiException.badRequest("too_young");
        }
        BigDecimal rate = in.weeklyRateKg().setScale(2, RoundingMode.HALF_UP);
        // by steps of 0.05 kg (a date chosen by the member gives any of them), within the bounds of the input
        if (rate.remainder(new BigDecimal("0.05")).signum() != 0) {
            throw ApiException.badRequest("invalid_rate");
        }
        if (rate.doubleValue() > BodyMath.maxWeeklyRate(in.currentWeightKg().doubleValue()) + 1e-9) {
            throw ApiException.badRequest("pace_too_fast");
        }
        double height = in.heightCm().doubleValue();
        if (in.goalWeightKg().doubleValue() < BodyMath.minHealthyWeight(height) - 0.05) {
            throw ApiException.badRequest("goal_too_low");
        }
        BodyProfile p = profiles.findById(userId).orElse(null);
        boolean first = p == null;
        if (first) {
            p = new BodyProfile(userId);
            p.setStartWeightKg(scale2(in.currentWeightKg()));
            p.setStartDate(today);
        }
        p.setSex(in.sex());
        p.setBirthDate(in.birthDate());
        p.setHeightCm(in.heightCm().setScale(1, RoundingMode.HALF_UP));
        if (in.job() != null) {
            // the two answers, and the level nearest to them (for the older apps)
            if (in.sessionsPerWeek() == null) {
                throw ApiException.badRequest("validation_failed");
            }
            p.setActivity(in.job(), in.sessionsPerWeek());
            p.setActivityLevel(BodyMath.nearest(BodyMath.activityFactor(in.job(), in.sessionsPerWeek())));
        } else if (in.activityLevel() != null) {
            // an app older than 1.7: its level, the answers kept while it sends back the same one
            if (first || p.getActivityLevel() != in.activityLevel()) {
                p.setActivity(null, null);
            }
            p.setActivityLevel(in.activityLevel());
        } else {
            throw ApiException.badRequest("validation_failed");
        }
        p.setGoalWeightKg(scale2(in.goalWeightKg()));
        p.setWeeklyRateKg(rate);
        p.touch();
        profiles.save(p);
        if (first) {
            BodyLog log = logs.findById(new BodyLog.Key(userId, today)).orElseGet(() -> new BodyLog(userId, today));
            log.setWeightKg(scale2(in.currentWeightKg()));
            log.touch();
            logs.save(log);
        }
        return p;
    }

    @Transactional
    public BodyLog saveLog(UUID userId, LocalDate day, LogInput in) {
        LocalDate today = today();
        if (day.isAfter(today.plusDays(1)) || day.isBefore(today.minusYears(2))) {
            throw ApiException.badRequest("invalid_day");
        }
        if (in.weightKg() == null && in.waistCm() == null && in.bodyFatPct() == null && in.hipsCm() == null
                && in.chestCm() == null && in.armCm() == null && in.thighCm() == null) {
            throw ApiException.badRequest("empty_log");
        }
        BodyLog log = logs.findById(new BodyLog.Key(userId, day)).orElseGet(() -> new BodyLog(userId, day));
        log.setWeightKg(scale2(in.weightKg()));
        log.setBodyFatPct(scale1(in.bodyFatPct()));
        log.setWaistCm(scale1(in.waistCm()));
        log.setHipsCm(scale1(in.hipsCm()));
        log.setChestCm(scale1(in.chestCm()));
        log.setArmCm(scale1(in.armCm()));
        log.setThighCm(scale1(in.thighCm()));
        log.setNote(in.note() == null || in.note().isBlank() ? null : in.note().strip());
        log.touch();
        return logs.save(log);
    }

    /**
     * The evening weigh-in of a day (1.9), next to the morning one: only for itself, the trend, the streak and the
     * targets keep the morning one (weighed at the same time each day, the honest comparison). Null takes it off.
     */
    @Transactional
    public void saveEvening(UUID userId, LocalDate day, BigDecimal kg) {
        LocalDate today = today();
        if (day.isAfter(today.plusDays(1)) || day.isBefore(today.minusDays(7))) {
            throw ApiException.badRequest("invalid_day");
        }
        BodyLog log = logs.findById(new BodyLog.Key(userId, day)).orElse(null);
        if (log == null) {
            if (kg == null) {
                return;
            }
            log = new BodyLog(userId, day);
        }
        log.setEveningWeightKg(scale2(kg));
        log.touch();
        logs.save(log);
    }

    @Transactional
    public void deleteLog(UUID userId, LocalDate day) {
        logs.deleteById(new BodyLog.Key(userId, day));
    }

    public List<LogDto> history(UUID userId) {
        List<BodyLog> all = logs.findByUserIdOrderByDayAsc(userId);
        List<Point> points = points(all);
        List<Double> trend = BodyMath.trend(points);
        List<LogDto> out = new ArrayList<>(all.size());
        int t = 0;
        for (BodyLog l : all) {
            Double trendKg = null;
            if (l.getWeightKg() != null) {
                trendKg = round2(trend.get(t++));
            }
            out.add(new LogDto(l.getDay(), d(l.getWeightKg()), trendKg, d(l.getBodyFatPct()), d(l.getWaistCm()),
                    d(l.getHipsCm()), d(l.getChestCm()), d(l.getArmCm()), d(l.getThighCm()), l.getNote(), d(l.getEveningWeightKg())));
        }
        return out;
    }

    public Summary summary(UUID userId) {
        BodyProfile p = profiles.findById(userId).orElseThrow(() -> ApiException.notFound());
        LocalDate today = today();
        List<BodyLog> all = logs.findByUserIdOrderByDayAsc(userId);
        List<Point> points = points(all);
        List<Double> trend = BodyMath.trend(points);
        List<String> warnings = new ArrayList<>();

        double height = p.getHeightCm().doubleValue();
        double start = p.getStartWeightKg().doubleValue();
        double goalKg = p.getGoalWeightKg().doubleValue();
        int age = BodyMath.age(p.getBirthDate(), today);
        Point last = points.isEmpty() ? null : points.getLast();
        double weight = last == null ? start : last.weightKg();
        double trendNow = trend.isEmpty() ? start : trend.getLast();

        LocalDate lastDay = last == null ? null : last.day();
        Double evening = lastDay == null ? null
                : all.stream().filter(l -> l.getDay().equals(lastDay)).findFirst().map(l -> d(l.getEveningWeightKg())).orElse(null);
        Current current = new Current(last == null ? null : weight, lastDay, round2(trendNow),
                round1(BodyMath.bmi(weight, height)), last == null ? null : round2(weight - start), evening);

        double bmr = BodyMath.bmr(p.getSex(), weight, height, age);
        double estimated = bmr * p.activityFactor();
        RealNeeds real = realNeeds(userId, points, trend, today);
        // the real needs when asked for, never far from the formula (a forgotten meal makes them look lower)
        double tdee = p.isAdaptiveTdee() && real != null ? Math.clamp(real.kcal(), estimated * 0.8, estimated * 1.2) : estimated;
        boolean losing = goalKg < trendNow;
        double rate = p.getWeeklyRateKg().doubleValue();
        int target = BodyMath.targetKcal(tdee, rate, losing, p.getSex());
        boolean floor = losing && target == BodyMath.kcalFloor(p.getSex()) && tdee - rate * BodyMath.KCAL_PER_KG / 7 < target;
        if (floor) {
            warnings.add("kcal_floor");
        }
        if (rate >= 0.75) {
            warnings.add("fast_pace");
        }
        Energy energy = new Energy((int) Math.round(bmr), (int) Math.round(tdee), target, floor, (int) Math.round(estimated),
                real == null ? null : real.kcal(), real == null ? null : real.days(), p.isAdaptiveTdee() && real != null);

        double remaining = round2(goalKg - trendNow);
        double total = goalKg - start;
        boolean reached = losing ? trendNow <= goalKg + 0.05 : trendNow >= goalKg - 0.05;
        int progress = total == 0 ? 100 : (int) Math.round(Math.clamp((trendNow - start) / total, 0, 1) * 100);
        double planPerDay = (losing ? -rate : rate) / 7;
        LocalDate planDate = reached ? today : BodyMath.eta(trendNow, goalKg, planPerDay, today);
        Double slope = BodyMath.slopePerDay(points, today, 28);
        LocalDate trendDate = reached ? today : slope == null ? null : BodyMath.eta(trendNow, goalKg, slope, today);
        Goal goal = new Goal(goalKg, remaining, progress, reached, planDate, trendDate,
                slope == null ? null : round2(slope * 7));

        ProfileDto profile = new ProfileDto(p.getSex(), p.getBirthDate(), age, height, p.getActivityLevel(), p.getJob(),
                p.getSessionsPerWeek(), round2(p.activityFactor()), p.getMacroSplit(), p.isAdaptiveTdee(), start, p.getStartDate(), goalKg, rate,
                round1(BodyMath.minHealthyWeight(height)));
        return new Summary(profile, current, energy, goal, streak(all, today), warnings);
    }

    /** the real needs (kcal a day) and the days they come from */
    record RealNeeds(int kcal, int days) {}

    /** at least 3 weeks between two weigh-ins, and meals noted on most days in between */
    static final int REAL_MIN_SPAN = 21;
    static final int REAL_MIN_LOGGED = 14;
    /** a day of meals below this was not fully noted: left out */
    static final int REAL_FULL_DAY_KCAL = 800;

    /**
     * What the member really spends, from their own numbers over the last 28 days: what they ate on average (the
     * days fully noted) plus what the weight trend lost (or minus what it gained), 7 700 kcal a kilo. Null without
     * enough of them: two weigh-ins at least 3 weeks apart, meals noted on 14 days and 70 % of the days between.
     */
    RealNeeds realNeeds(UUID userId, List<Point> points, List<Double> trend, LocalDate today) {
        LocalDate from = today.minusDays(28);
        int first = -1;
        int last = -1;
        for (int i = 0; i < points.size(); i++) {
            LocalDate d = points.get(i).day();
            if (!d.isBefore(from) && !d.isAfter(today)) {
                if (first < 0) {
                    first = i;
                }
                last = i;
            }
        }
        if (first < 0 || last <= first) {
            return null;
        }
        LocalDate a = points.get(first).day();
        LocalDate b = points.get(last).day();
        long span = java.time.temporal.ChronoUnit.DAYS.between(a, b);
        if (span < REAL_MIN_SPAN) {
            return null;
        }
        List<Double> days = jdbc.queryForList("""
                select sum(kcal) from meal_entry where user_id = ? and day >= ? and day < ? group by day having sum(kcal) >= ?""",
                Double.class, userId, a, b, REAL_FULL_DAY_KCAL);
        if (days.size() < REAL_MIN_LOGGED || days.size() < span * 0.7) {
            return null;
        }
        double eaten = days.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        double changeKg = trend.get(last) - trend.get(first);
        double kcal = eaten - changeKg * BodyMath.KCAL_PER_KG / span;
        if (kcal < 1000 || kcal > 5000) {
            return null;
        }
        return new RealNeeds((int) Math.round(kcal / 10) * 10, days.size());
    }

    /** the target from the real needs (when known), or from the formula */
    @Transactional
    public void setAdaptive(UUID userId, boolean on) {
        BodyProfile p = profiles.findById(userId).orElseThrow(() -> ApiException.notFound());
        p.setAdaptiveTdee(on);
        p.touch();
        profiles.save(p);
    }

    /** the split of the macros the member chose */
    @Transactional
    public void setMacroSplit(UUID userId, MacroSplit split) {
        BodyProfile p = profiles.findById(userId).orElseThrow(() -> ApiException.notFound());
        p.setMacroSplit(split);
        p.touch();
        profiles.save(p);
    }

    /** The flame and its freezes (see {@link Streaks}), with the week and the last 28 days to draw them. */
    static Streak streak(List<BodyLog> all, LocalDate today) {
        Set<LocalDate> done = new HashSet<>();
        for (BodyLog l : all) {
            if (l.getWeightKg() != null) {
                done.add(l.getDay());
            }
        }
        Streaks.Result r = Streaks.compute(done, today);
        LocalDate monday = today.with(DayOfWeek.MONDAY);
        List<Day> week = new ArrayList<>(7);
        for (int i = 0; i < 7; i++) {
            week.add(day(monday.plusDays(i), r, today));
        }
        List<Day> calendar = new ArrayList<>(28);
        for (int i = 27; i >= 0; i--) {
            calendar.add(day(today.minusDays(i), r, today));
        }
        return new Streak(r.days(), r.todayDone(), week, r.best(), r.freezes(), calendar);
    }

    private static Day day(LocalDate d, Streaks.Result r, LocalDate today) {
        Streaks.State s = r.state(d);
        return new Day(d, s == Streaks.State.DONE, d.isAfter(today), s == Streaks.State.FROZEN);
    }

    private static List<Point> points(List<BodyLog> all) {
        return all.stream().filter(l -> l.getWeightKg() != null)
                .map(l -> new Point(l.getDay(), l.getWeightKg().doubleValue())).toList();
    }

    private static BigDecimal scale2(BigDecimal v) {
        return v == null ? null : v.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal scale1(BigDecimal v) {
        return v == null ? null : v.setScale(1, RoundingMode.HALF_UP);
    }

    private static Double d(BigDecimal v) {
        return v == null ? null : v.doubleValue();
    }

    private static double round2(double v) {
        return Math.round(v * 100) / 100.0;
    }

    private static double round1(double v) {
        return Math.round(v * 10) / 10.0;
    }
}
