package fr.mbonnici.mybody365.tracking;

import fr.mbonnici.mybody365.common.ApiException;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 1.19: the recap of a month, told like a story in the app and shared as a picture: the weigh-ins (from the first to the last
 * of the month), the longest run of days weighed, the meals (the days noted, the calories of a day, the health score of the
 * plate, what was eaten most), the days of the water goal, the first and the last photo, the milestones reached. Nothing of
 * it is kept: worked out when asked.
 */
@Service
public class MonthlyRecap {

    public record Point(LocalDate day, double kg) {}

    public record Weight(Double startKg, Double endKg, Double deltaKg, int days, List<Point> points) {}

    public record Top(String name, int count) {}

    public record Meals(int days, int entries, Integer avgKcal, Double avgHealth, List<Top> top) {}

    public record PhotoRef(UUID id, LocalDate day, String pose, String thumbUrl, String fullUrl) {}

    public record Photos(int count, PhotoRef first, PhotoRef last) {}

    public record Recap(String month, int daysInMonth, String firstName, Weight weight, int bestRun, Meals meals, Integer waterGoal,
            int waterDays, Photos photos, List<Double> milestones, Integer targetKcal) {}

    private final JdbcTemplate jdbc;
    private final TrackingService tracking;

    public MonthlyRecap(JdbcTemplate jdbc, TrackingService tracking) {
        this.jdbc = jdbc;
        this.tracking = tracking;
    }

    /** a month of the last two years, up to this one */
    public Recap recap(UUID userId, YearMonth month) {
        YearMonth now = YearMonth.from(TrackingService.today());
        if (month.isAfter(now) || month.isBefore(now.minusMonths(24))) {
            throw ApiException.badRequest("invalid_month");
        }
        LocalDate from = month.atDay(1);
        LocalDate to = month.atEndOfMonth();

        List<Point> points = jdbc.query("""
                select day, weight_kg from body_log where user_id = ? and day between ? and ? and weight_kg is not null order by day""",
                (rs, i) -> new Point(rs.getObject("day", LocalDate.class), rs.getDouble("weight_kg")), userId, from, to);
        Double start = points.isEmpty() ? null : points.getFirst().kg();
        Double end = points.isEmpty() ? null : points.getLast().kg();
        Weight weight = new Weight(start, end, start == null ? null : Math.round((end - start) * 10) / 10.0, points.size(), points);

        int run = 0;
        int best = 0;
        LocalDate previous = null;
        for (Point p : points) {
            run = previous != null && previous.plusDays(1).equals(p.day()) ? run + 1 : 1;
            best = Math.max(best, run);
            previous = p.day();
        }

        Meals meals = jdbc.query("""
                select count(distinct day) as days, count(*) as entries, sum(kcal) as kcal,
                  sum(kcal * health) filter (where health is not null) / nullif(sum(kcal) filter (where health is not null), 0) as health
                from meal_entry where user_id = ? and day between ? and ?""", (rs, i) -> {
            int days = rs.getInt("days");
            double kcal = rs.getDouble("kcal");
            double health = rs.getDouble("health");
            boolean noHealth = rs.wasNull();
            return new Meals(days, rs.getInt("entries"), days == 0 ? null : (int) Math.round(kcal / days), noHealth ? null : Math.round(health * 2) / 2.0,
                    List.of());
        }, userId, from, to).getFirst();
        List<Top> top = jdbc.query("""
                select min(name) as name, count(*) as n from meal_entry where user_id = ? and day between ? and ?
                group by lower(name) order by n desc, min(name) limit 3""", (rs, i) -> new Top(rs.getString("name"), rs.getInt("n")), userId, from, to);
        meals = new Meals(meals.days(), meals.entries(), meals.avgKcal(), meals.avgHealth(), top);

        Integer waterGoal = jdbc.queryForObject("select water_goal from app_user where id = ?", Integer.class, userId);
        Integer waterDays = waterGoal == null || waterGoal <= 0 ? 0 : jdbc.queryForObject("""
                select count(*) from water_log where user_id = ? and day between ? and ? and glasses >= ?""", Integer.class, userId, from, to,
                waterGoal);

        List<PhotoRef> photos = jdbc.query("""
                select id, day, pose from photo where user_id = ? and day between ? and ? order by day, created_at""",
                (rs, i) -> {
                    UUID id = rs.getObject("id", UUID.class);
                    return new PhotoRef(id, rs.getObject("day", LocalDate.class), rs.getString("pose"), "/api/photos/" + id + "/thumb",
                            "/api/photos/" + id + "/full");
                }, userId, from, to);
        // the same pose at both ends when there is one: the front view first
        List<PhotoRef> front = photos.stream().filter(p -> "FRONT".equals(p.pose())).toList();
        List<PhotoRef> pair = front.size() >= 2 ? front : photos;
        Photos ph = new Photos(photos.size(), pair.isEmpty() ? null : pair.getFirst(), pair.size() < 2 ? null : pair.getLast());

        List<Double> milestones = new ArrayList<>(jdbc.queryForList("""
                select target_kg from weight_milestone where user_id = ? and reached_on between ? and ? order by reached_on""", Double.class,
                userId, from, to));
        String name = jdbc.queryForObject("select display_name from app_user where id = ?", String.class, userId);
        String first = name == null ? "" : name.strip().split("\\s+")[0];
        Integer target = null;
        try {
            target = tracking.summary(userId).energy().targetKcal();
        } catch (RuntimeException e) {
            // no profile yet: no target to compare with
        }
        return new Recap(month.toString(), month.lengthOfMonth(), first, weight, best, meals, waterGoal, waterDays == null ? 0 : waterDays, ph,
                milestones, target);
    }

    /** enough of a month to tell (a recap of nothing is not sent) */
    public boolean worthTelling(UUID userId, YearMonth month) {
        LocalDate from = month.atDay(1);
        LocalDate to = month.atEndOfMonth();
        Integer weighs = jdbc.queryForObject("select count(*) from body_log where user_id = ? and day between ? and ? and weight_kg is not null",
                Integer.class, userId, from, to);
        Integer mealDays = jdbc.queryForObject("select count(distinct day) from meal_entry where user_id = ? and day between ? and ?",
                Integer.class, userId, from, to);
        return (weighs != null && weighs >= 3) || (mealDays != null && mealDays >= 3);
    }
}
