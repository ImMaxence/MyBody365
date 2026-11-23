package fr.mbonnici.mybody365.share;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.config.AppProperties;
import fr.mbonnici.mybody365.tracking.TrackingService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 1.19: a read-only link for a coach or a dietitian, made by the member: what it shows (the weigh-ins, the meals, the blood
 * pressure: chosen one by one, never the photos nor the pill box), for 7 or 30 days, revocable at any time, each opening
 * counted. Only the hash of its token is kept: the link is shown once, when made. The page it opens (/partage#token) asks
 * the server with the token, which never travels in an address the server logs (it stays after the #).
 */
@Service
public class ShareLinks {

    public enum Scope { WEIGHT, MEALS, BP }

    public record CreateInput(@Size(max = 60) String label, @NotNull @Min(1) @Max(30) Integer days, @NotEmpty @Size(max = 3) List<Scope> scopes) {}

    public record LinkDto(UUID id, String label, List<Scope> scopes, Instant expiresAt, Instant revokedAt, Instant createdAt, int openedCount,
            Instant lastOpenedAt, boolean active) {}

    /** the link itself: shown once */
    public record Created(LinkDto link, String url) {}

    public record Point(LocalDate day, double kg, Double eveningKg) {}

    public record Weight(Double startKg, LocalDate startDate, Double goalKg, Double heightCm, List<Point> logs) {}

    public record MealLine(String slot, String name, Double grams, Double servings, boolean liquid, double kcal) {}

    public record MealDay(LocalDate day, double kcal, Double proteinG, Double carbsG, Double fatG, List<MealLine> lines) {}

    public record BpRow(LocalDate day, String moment, int systolic, int diastolic, Integer pulse, int readings) {}

    public record Shared(String name, String label, Instant until, List<Scope> scopes, Instant generatedAt, Weight weight, Integer targetKcal,
            List<MealDay> meals, List<BpRow> bp) {}

    /** links open at once at most, per member */
    static final int MAX_OPEN = 10;
    static final int WEIGHT_DAYS = 120;
    static final int MEAL_DAYS = 14;
    static final int BP_DAYS = 30;
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9_-]{43}");

    private final JdbcTemplate jdbc;
    private final AppProperties props;
    private final TrackingService tracking;
    private final SecureRandom random = new SecureRandom();

    public ShareLinks(JdbcTemplate jdbc, AppProperties props, TrackingService tracking) {
        this.jdbc = jdbc;
        this.props = props;
        this.tracking = tracking;
    }

    public Created create(UUID userId, CreateInput in) {
        Integer open = jdbc.queryForObject("select count(*) from share_link where user_id = ? and revoked_at is null and expires_at > now()",
                Integer.class, userId);
        if (open != null && open >= MAX_OPEN) {
            throw ApiException.badRequest("share_full");
        }
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        UUID id = UUID.randomUUID();
        Instant expires = Instant.now().plus(in.days(), ChronoUnit.DAYS);
        String scopes = String.join(",", in.scopes().stream().distinct().map(Enum::name).toList());
        String label = in.label() == null || in.label().isBlank() ? null : in.label().strip();
        jdbc.update("insert into share_link (id, user_id, token_hash, label, scopes, expires_at) values (?, ?, ?, ?, ?, ?)", id, userId, hash(token),
                label, scopes, Timestamp.from(expires));
        LinkDto link = list(userId).stream().filter(l -> l.id().equals(id)).findFirst().orElseThrow();
        return new Created(link, props.url() + "/partage#" + token);
    }

    /** the links of the last 90 days, open ones first */
    public List<LinkDto> list(UUID userId) {
        return jdbc.query("""
                select * from share_link where user_id = ? and created_at > now() - interval '90 days'
                order by (revoked_at is null and expires_at > now()) desc, created_at desc""", (rs, i) -> {
            Timestamp revoked = rs.getTimestamp("revoked_at");
            Timestamp opened = rs.getTimestamp("last_opened_at");
            Instant expires = rs.getTimestamp("expires_at").toInstant();
            return new LinkDto(rs.getObject("id", UUID.class), rs.getString("label"), scopes(rs.getString("scopes")), expires,
                    revoked == null ? null : revoked.toInstant(), rs.getTimestamp("created_at").toInstant(), rs.getInt("opened_count"),
                    opened == null ? null : opened.toInstant(), revoked == null && expires.isAfter(Instant.now()));
        }, userId);
    }

    public void revoke(UUID userId, UUID id) {
        if (jdbc.update("update share_link set revoked_at = coalesce(revoked_at, now()) where id = ? and user_id = ?", id, userId) == 0) {
            throw ApiException.notFound();
        }
    }

    /** what a link shows, for whoever holds it (no account): gone once revoked or expired */
    public Shared open(String token) {
        if (token == null || !TOKEN.matcher(token).matches()) {
            throw ApiException.notFound();
        }
        Map<String, Object> link = jdbc.queryForList("select * from share_link where token_hash = ?", hash(token)).stream().findFirst()
                .orElseThrow(ApiException::notFound);
        Instant expires = ((Timestamp) link.get("expires_at")).toInstant();
        if (link.get("revoked_at") != null || expires.isBefore(Instant.now())) {
            throw new ApiException(HttpStatus.GONE, "share_expired");
        }
        UUID userId = (UUID) link.get("user_id");
        jdbc.update("update share_link set opened_count = opened_count + 1, last_opened_at = now() where id = ?", link.get("id"));
        List<Scope> scopes = scopes((String) link.get("scopes"));
        String name = jdbc.queryForObject("select display_name from app_user where id = ?", String.class, userId);
        String first = name == null ? "" : name.strip().split("\\s+")[0];
        LocalDate today = TrackingService.today();
        Weight weight = scopes.contains(Scope.WEIGHT) ? weight(userId, today) : null;
        Integer target = null;
        if (scopes.contains(Scope.MEALS)) {
            try {
                target = tracking.summary(userId).energy().targetKcal();
            } catch (RuntimeException e) {
                // no profile: no target
            }
        }
        return new Shared(first, (String) link.get("label"), expires, scopes, Instant.now(), weight, target,
                scopes.contains(Scope.MEALS) ? meals(userId, today) : null, scopes.contains(Scope.BP) ? bp(userId, today) : null);
    }

    private Weight weight(UUID userId, LocalDate today) {
        List<Point> logs = jdbc.query("""
                select day, weight_kg, evening_weight_kg from body_log where user_id = ? and day > ? and weight_kg is not null order by day""",
                (rs, i) -> {
                    double evening = rs.getDouble("evening_weight_kg");
                    Double eveningKg = rs.wasNull() ? null : evening;
                    return new Point(rs.getObject("day", LocalDate.class), rs.getDouble("weight_kg"), eveningKg);
                }, userId, today.minusDays(WEIGHT_DAYS));
        return jdbc.query("select start_weight_kg, start_date, goal_weight_kg, height_cm from body_profile where user_id = ?",
                (rs, i) -> new Weight(rs.getDouble("start_weight_kg"), rs.getObject("start_date", LocalDate.class), rs.getDouble("goal_weight_kg"),
                        rs.getDouble("height_cm"), logs), userId).stream().findFirst().orElse(new Weight(null, null, null, null, logs));
    }

    private List<MealDay> meals(UUID userId, LocalDate today) {
        Map<LocalDate, List<MealLine>> lines = new LinkedHashMap<>();
        Map<LocalDate, double[]> totals = new LinkedHashMap<>();
        jdbc.query("""
                select day, slot, name, grams, servings, liquid, kcal, protein_g, carbs_g, fat_g from meal_entry
                where user_id = ? and day > ? order by day desc, case slot when 'BREAKFAST' then 0 when 'LUNCH' then 1 when 'SNACK' then 2 else 3 end,
                  created_at""", rs -> {
            LocalDate day = rs.getObject("day", LocalDate.class);
            double g = rs.getDouble("grams");
            Double grams = rs.wasNull() ? null : g;
            double s = rs.getDouble("servings");
            Double servings = rs.wasNull() ? null : s;
            double kcal = rs.getDouble("kcal");
            lines.computeIfAbsent(day, d -> new ArrayList<>()).add(new MealLine(rs.getString("slot"), rs.getString("name"), grams, servings,
                    rs.getBoolean("liquid"), Math.round(kcal)));
            double[] t = totals.computeIfAbsent(day, d -> new double[4]);
            t[0] += kcal;
            t[1] += rs.getDouble("protein_g");
            t[2] += rs.getDouble("carbs_g");
            t[3] += rs.getDouble("fat_g");
        }, userId, today.minusDays(MEAL_DAYS));
        List<MealDay> out = new ArrayList<>();
        for (Map.Entry<LocalDate, List<MealLine>> e : lines.entrySet()) {
            double[] t = totals.get(e.getKey());
            out.add(new MealDay(e.getKey(), Math.round(t[0]), round(t[1]), round(t[2]), round(t[3]), e.getValue()));
        }
        return out;
    }

    private List<BpRow> bp(UUID userId, LocalDate today) {
        return jdbc.query("""
                select day, moment, systolic, diastolic, pulse, readings from bp_log where user_id = ? and day > ? order by day desc, moment desc""",
                (rs, i) -> {
                    int p = rs.getInt("pulse");
                    Integer pulse = rs.wasNull() ? null : p;
                    return new BpRow(rs.getObject("day", LocalDate.class), rs.getString("moment"), rs.getInt("systolic"), rs.getInt("diastolic"), pulse,
                            rs.getInt("readings"));
                }, userId, today.minusDays(BP_DAYS));
    }

    private static Double round(double v) {
        return Math.round(v * 10) / 10.0;
    }

    private static List<Scope> scopes(String csv) {
        return Arrays.stream(csv.split(",")).filter(s -> !s.isBlank()).map(Scope::valueOf).toList();
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
