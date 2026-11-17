package fr.mbonnici.mybody365.tracking;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Milestones of one's own on the way to the goal (1.8): a weight to pass, and maybe a reward (« un resto », « des
 * baskets »). Each one is reached by the first weigh-in that passes it (below it when losing, above it when gaining),
 * and stays reached: an achievement, not a state. Ten at most.
 */
@RestController
public class Milestones {

    static final int MAX = 10;

    public record MilestoneInput(@NotNull @DecimalMin("30") @DecimalMax("300") BigDecimal targetKg, @Size(max = 80) String reward) {}

    public record MilestoneDto(UUID id, double targetKg, String reward, LocalDate reachedOn) {}

    private final JdbcTemplate jdbc;
    private final UserService users;

    public Milestones(JdbcTemplate jdbc, UserService users) {
        this.jdbc = jdbc;
        this.users = users;
    }

    /** in the order of the way: the nearest first (from the starting weight towards the goal) */
    @GetMapping("/api/me/milestones")
    public List<MilestoneDto> list(Authentication auth) {
        return list(users.current(auth).getId());
    }

    @PostMapping("/api/me/milestones")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public List<MilestoneDto> add(@Valid @RequestBody MilestoneInput body, Authentication auth) {
        UUID me = users.current(auth).getId();
        Integer count = jdbc.queryForObject("select count(*) from weight_milestone where user_id = ?", Integer.class, me);
        if (count != null && count >= MAX) {
            throw ApiException.badRequest("milestones_full");
        }
        BigDecimal target = round(body.targetKg());
        if (exists(me, target, null)) {
            throw ApiException.conflict("milestone_exists");
        }
        jdbc.update("insert into weight_milestone (id, user_id, target_kg, reward) values (?, ?, ?, ?)", UUID.randomUUID(), me, target,
                reward(body.reward()));
        markReached(me);
        return list(me);
    }

    /** another weight or reward: reached again from scratch (the weigh-ins already there may reach it at once) */
    @PutMapping("/api/me/milestones/{id}")
    @Transactional
    public List<MilestoneDto> update(@PathVariable UUID id, @Valid @RequestBody MilestoneInput body, Authentication auth) {
        UUID me = users.current(auth).getId();
        BigDecimal target = round(body.targetKg());
        if (exists(me, target, id)) {
            throw ApiException.conflict("milestone_exists");
        }
        int n = jdbc.update("""
                update weight_milestone set reward = ?,
                  reached_on = case when target_kg = ? then reached_on end, target_kg = ?
                where id = ? and user_id = ?""", reward(body.reward()), target, target, id, me);
        if (n == 0) {
            throw ApiException.notFound();
        }
        markReached(me);
        return list(me);
    }

    @DeleteMapping("/api/me/milestones/{id}")
    @Transactional
    public List<MilestoneDto> delete(@PathVariable UUID id, Authentication auth) {
        UUID me = users.current(auth).getId();
        jdbc.update("delete from weight_milestone where id = ? and user_id = ?", id, me);
        return list(me);
    }

    List<MilestoneDto> list(UUID userId) {
        boolean gain = gaining(userId);
        return jdbc.query("select id, target_kg, reward, reached_on from weight_milestone where user_id = ? order by target_kg "
                + (gain ? "asc" : "desc"), (rs, i) -> {
                    Date d = rs.getDate("reached_on");
                    return new MilestoneDto(rs.getObject("id", UUID.class), rs.getDouble("target_kg"), rs.getString("reward"),
                            d == null ? null : d.toLocalDate());
                }, userId);
    }

    /**
     * The milestones a weigh-in has passed, reached on the first day one did (called after each weigh-in, whatever
     * day it was noted for). Losing weight (the goal under the start): at or under the milestone; gaining: at or over.
     */
    public void markReached(UUID userId) {
        String passed = gaining(userId) ? "b.weight_kg >= m.target_kg" : "b.weight_kg <= m.target_kg";
        jdbc.update("""
                update weight_milestone m set reached_on = (
                  select min(b.day) from body_log b where b.user_id = m.user_id and b.weight_kg is not null and %s)
                where m.user_id = ? and m.reached_on is null
                  and exists (select 1 from body_log b where b.user_id = m.user_id and b.weight_kg is not null and %s)"""
                .formatted(passed, passed), userId);
    }

    /** the goal above the starting weight */
    private boolean gaining(UUID userId) {
        return jdbc.queryForList("select start_weight_kg < goal_weight_kg from body_profile where user_id = ?", Boolean.class, userId).stream()
                .anyMatch(Boolean.TRUE::equals);
    }

    private boolean exists(UUID userId, BigDecimal target, UUID except) {
        Integer n = except == null
                ? jdbc.queryForObject("select count(*) from weight_milestone where user_id = ? and target_kg = ?", Integer.class, userId, target)
                : jdbc.queryForObject("select count(*) from weight_milestone where user_id = ? and target_kg = ? and id <> ?", Integer.class, userId,
                        target, except);
        return n != null && n > 0;
    }

    private static BigDecimal round(BigDecimal kg) {
        return kg.setScale(1, RoundingMode.HALF_UP);
    }

    private static String reward(String r) {
        return r == null || r.isBlank() ? null : r.strip();
    }
}
