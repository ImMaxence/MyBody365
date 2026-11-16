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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Body profile, daily log, and the summary of the "Today" and "Progress" screens. */
@Service
public class TrackingService {

    /** the calendar day of the users (the app is French): "today" never flips at midnight UTC */
    public static final ZoneId ZONE = ZoneId.of("Europe/Paris");
    private static final Set<BigDecimal> RATES = Set.of(new BigDecimal("0.25"), new BigDecimal("0.50"),
            new BigDecimal("0.75"), new BigDecimal("1.00"));

    private final BodyProfileRepository profiles;
    private final BodyLogRepository logs;

    public TrackingService(BodyProfileRepository profiles, BodyLogRepository logs) {
        this.profiles = profiles;
        this.logs = logs;
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
        if (!RATES.contains(rate)) {
            throw ApiException.badRequest("invalid_rate");
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
        p.setActivityLevel(in.activityLevel());
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
                    d(l.getHipsCm()), d(l.getChestCm()), d(l.getArmCm()), d(l.getThighCm()), l.getNote()));
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

        Current current = new Current(last == null ? null : weight, last == null ? null : last.day(), round2(trendNow),
                round1(BodyMath.bmi(weight, height)), last == null ? null : round2(weight - start));

        double bmr = BodyMath.bmr(p.getSex(), weight, height, age);
        double tdee = BodyMath.tdee(bmr, p.getActivityLevel());
        boolean losing = goalKg < trendNow;
        double rate = p.getWeeklyRateKg().doubleValue();
        int target = BodyMath.targetKcal(tdee, rate, losing, p.getSex());
        boolean floor = losing && target == BodyMath.kcalFloor(p.getSex()) && tdee - rate * BodyMath.KCAL_PER_KG / 7 < target;
        if (floor) {
            warnings.add("kcal_floor");
        }
        if (rate >= 1.0) {
            warnings.add("fast_pace");
        }
        Energy energy = new Energy((int) Math.round(bmr), (int) Math.round(tdee), target, floor);

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

        ProfileDto profile = new ProfileDto(p.getSex(), p.getBirthDate(), age, height, p.getActivityLevel(), start,
                p.getStartDate(), goalKg, rate, round1(BodyMath.minHealthyWeight(height)));
        return new Summary(profile, current, energy, goal, streak(all, today), warnings);
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
