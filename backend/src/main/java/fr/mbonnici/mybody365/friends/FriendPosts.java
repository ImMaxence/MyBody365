package fr.mbonnici.mybody365.friends;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.meals.MealService;
import fr.mbonnici.mybody365.meals.MealService.DayDto;
import fr.mbonnici.mybody365.meals.MealService.EntryDto;
import fr.mbonnici.mybody365.push.PushService;
import fr.mbonnici.mybody365.tracking.TrackingDtos.Summary;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.AppUser;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * What a member shows their friends (1.9): their way to the goal (PROGRESS) or what they ate on a day (DAY). The server
 * makes the snapshot itself from the member's own data, when they share it: nothing typed by the app is shown as is, and
 * the snapshot does not change afterwards. One of each kind a day (sharing again replaces it), seen by the friends only,
 * kept 30 days (RetentionJob). The friends are told once (not on a locked screen: no figure in the notification), and
 * can cheer (« Bravo »), which tells the member once per friend.
 */
@Service
public class FriendPosts {

    private static final Logger log = LoggerFactory.getLogger(FriendPosts.class);
    public static final int KEEP_DAYS = 30;
    /** a day's lines shown, at most */
    static final int MAX_LINES = 40;

    /** MILESTONE: a milestone reached on the way to the goal (its reward stays private) */
    public enum Kind { PROGRESS, DAY, MILESTONE }

    public record Author(UUID id, String name, String avatarUrl) {}

    public record PostDto(UUID id, Kind kind, LocalDate day, Instant createdAt, Author author, boolean mine, Map<String, Object> data,
            int cheers, boolean cheered) {}

    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final TrackingService tracking;
    private final MealService meals;
    private final FriendService friends;
    private final PushService push;
    private final TaskExecutor executor;

    public FriendPosts(JdbcTemplate jdbc, JsonMapper json, TrackingService tracking, MealService meals, FriendService friends, PushService push,
            @Qualifier("applicationTaskExecutor") TaskExecutor executor) {
        this.jdbc = jdbc;
        this.json = json;
        this.tracking = tracking;
        this.meals = meals;
        this.friends = friends;
        this.push = push;
        this.executor = executor;
    }

    /** the way to the goal, today; the weights themselves only when asked (otherwise the change and the share of the way) */
    @Transactional
    public PostDto shareProgress(UUID userId, boolean weights) {
        return save(userId, Kind.PROGRESS, TrackingService.today(), progress(userId, weights));
    }

    /** the meals of a day (one already lived), as they were noted: name and calories of each line, the totals */
    @Transactional
    public PostDto shareDay(UUID userId, LocalDate day) {
        return save(userId, Kind.DAY, day, dayData(userId, day));
    }

    /** a milestone of mine, reached: its weight only when asked, otherwise the way done to it; never its reward */
    @Transactional
    public PostDto shareMilestone(UUID userId, UUID milestoneId, boolean weights) {
        return save(userId, Kind.MILESTONE, TrackingService.today(), milestone(userId, milestoneId, weights));
    }

    /** what the friends would see, nothing saved (the share sheet shows it first) */
    public PostDto preview(UUID userId, Kind kind, boolean weights, LocalDate day, UUID milestoneId) {
        LocalDate d = kind == Kind.DAY ? day : TrackingService.today();
        Map<String, Object> data = switch (kind) {
            case PROGRESS -> progress(userId, weights);
            case DAY -> dayData(userId, day);
            case MILESTONE -> milestone(userId, milestoneId, weights);
        };
        Map<String, Object> me = jdbc.queryForMap("select display_name, avatar_version from app_user where id = ?", userId);
        Author author = new Author(userId, FriendService.firstName((String) me.get("display_name")),
                AppUser.pictureUrl(userId, (Integer) me.get("avatar_version")));
        return new PostDto(null, kind, d, Instant.now(), author, true, data, 0, false);
    }

    private Map<String, Object> progress(UUID userId, boolean weights) {
        Summary s = tracking.summary(userId);
        LocalDate today = TrackingService.today();
        double start = s.profile().startWeightKg();
        Double current = s.current() == null ? null : s.current().weightKg();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("weights", weights);
        data.put("startKg", weights ? start : null);
        data.put("currentKg", weights ? current : null);
        data.put("goalKg", weights ? s.goal().goalKg() : null);
        data.put("changeKg", current == null ? 0 : Math.round((current - start) * 10) / 10.0);
        data.put("losing", s.goal().goalKg() < start);
        data.put("progressPct", Math.max(0, Math.min(100, s.goal().progressPct())));
        data.put("reached", s.goal().reached());
        data.put("streak", s.streak() == null ? 0 : s.streak().days());
        LocalDate since = s.profile().startDate();
        data.put("days", since == null ? 0 : Math.max(0, (int) java.time.temporal.ChronoUnit.DAYS.between(since, today)));
        return data;
    }

    private Map<String, Object> milestone(UUID userId, UUID milestoneId, boolean weights) {
        if (milestoneId == null) {
            throw ApiException.badRequest("validation_failed");
        }
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select m.target_kg, m.reached_on, p.start_weight_kg, p.goal_weight_kg from weight_milestone m
                join body_profile p on p.user_id = m.user_id where m.id = ? and m.user_id = ?""", milestoneId, userId);
        if (rows.isEmpty()) {
            throw ApiException.notFound();
        }
        Map<String, Object> m = rows.getFirst();
        if (m.get("reached_on") == null) {
            throw ApiException.badRequest("milestone_not_reached");
        }
        double target = ((Number) m.get("target_kg")).doubleValue();
        double start = ((Number) m.get("start_weight_kg")).doubleValue();
        double goal = ((Number) m.get("goal_weight_kg")).doubleValue();
        Integer reached = jdbc.queryForObject("select count(*) from weight_milestone where user_id = ? and reached_on is not null", Integer.class,
                userId);
        Integer total = jdbc.queryForObject("select count(*) from weight_milestone where user_id = ?", Integer.class, userId);
        Summary s = tracking.summary(userId);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("weights", weights);
        data.put("targetKg", weights ? target : null);
        data.put("changeKg", Math.round((target - start) * 10) / 10.0);
        data.put("losing", goal < start);
        data.put("reachedOn", m.get("reached_on").toString());
        data.put("reached", reached == null ? 0 : reached);
        data.put("total", total == null ? 0 : total);
        data.put("streak", s.streak() == null ? 0 : s.streak().days());
        return data;
    }

    private Map<String, Object> dayData(UUID userId, LocalDate day) {
        LocalDate today = TrackingService.today();
        if (day == null || day.isAfter(today) || day.isBefore(today.minusDays(7))) {
            throw ApiException.badRequest("validation_failed");
        }
        DayDto d = meals.day(userId, day);
        if (d.entries().isEmpty()) {
            throw ApiException.badRequest("nothing_to_share");
        }
        List<Map<String, Object>> lines = new ArrayList<>();
        for (EntryDto e : d.entries().stream().limit(MAX_LINES).toList()) {
            Map<String, Object> l = new LinkedHashMap<>();
            l.put("slot", e.slot().name());
            l.put("name", e.name().length() > 120 ? e.name().substring(0, 120) : e.name());
            l.put("kcal", Math.round(e.nutrients().kcal()));
            l.put("nutriscore", e.nutriscore());
            lines.add(l);
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kcal", Math.round(d.totals().kcal()));
        data.put("targetKcal", d.targetKcal());
        data.put("proteinG", round(d.totals().proteinG()));
        data.put("carbsG", round(d.totals().carbsG()));
        data.put("fatG", round(d.totals().fatG()));
        data.put("lines", lines);
        data.put("more", Math.max(0, d.entries().size() - MAX_LINES));
        return data;
    }

    private static Long round(Double v) {
        return v == null ? null : Math.round(v);
    }

    private PostDto save(UUID userId, Kind kind, LocalDate day, Map<String, Object> data) {
        String payload = json.writeValueAsString(data);
        List<UUID> before = jdbc.queryForList("select id from friend_post where user_id = ? and kind = ? and day = ?", UUID.class, userId,
                kind.name(), day);
        UUID id;
        if (before.isEmpty()) {
            id = UUID.randomUUID();
            jdbc.update("insert into friend_post (id, user_id, kind, day, payload) values (?, ?, ?, ?, ?)", id, userId, kind.name(), day, payload);
            announce(userId, kind);
        } else {
            id = before.getFirst();
            jdbc.update("update friend_post set payload = ?, created_at = now() where id = ?", payload, id);
        }
        return one(id, userId);
    }

    /** mine, the newest first */
    public List<PostDto> mine(UUID userId) {
        return query("p.user_id = ?", userId, userId);
    }

    /** my friends', the newest first, the last two weeks */
    public List<PostDto> ofFriends(UUID userId) {
        return query("""
                p.user_id in (select case when f.user_a = ? then f.user_b else f.user_a end from friendship f where f.user_a = ? or f.user_b = ?)
                and p.created_at > now() - interval '14 days'""", userId, userId, userId, userId);
    }

    @Transactional
    public void delete(UUID userId, UUID postId) {
        if (jdbc.update("delete from friend_post where id = ? and user_id = ?", postId, userId) == 0) {
            throw ApiException.notFound();
        }
    }

    /** « Bravo » on a friend's post: once each; the author is told the first time */
    @Transactional
    public PostDto cheer(UUID userId, UUID postId) {
        UUID owner = owner(postId);
        if (owner.equals(userId) || !friends.friends(owner, userId)) {
            throw ApiException.notFound();
        }
        int added = jdbc.update("insert into friend_post_cheer (post_id, user_id) values (?, ?) on conflict do nothing", postId, userId);
        if (added > 0 && accepts(owner)) {
            String name = FriendService.firstName(jdbc.queryForObject("select display_name from app_user where id = ?", String.class, userId));
            String kind = jdbc.queryForObject("select kind from friend_post where id = ?", String.class, postId);
            later(() -> push.notify(owner, PushService.Kind.FRIEND_CHEER, Map.of("name", name, "kind", kind)));
        }
        return one(postId, userId);
    }

    @Transactional
    public PostDto uncheer(UUID userId, UUID postId) {
        UUID owner = owner(postId);
        if (!owner.equals(userId) && !friends.friends(owner, userId)) {
            throw ApiException.notFound();
        }
        jdbc.update("delete from friend_post_cheer where post_id = ? and user_id = ?", postId, userId);
        return one(postId, userId);
    }

    private UUID owner(UUID postId) {
        return jdbc.queryForList("select user_id from friend_post where id = ?", UUID.class, postId).stream().findFirst()
                .orElseThrow(ApiException::notFound);
    }

    private PostDto one(UUID postId, UUID viewerId) {
        return query("p.id = ?", viewerId, postId).stream().findFirst().orElseThrow(ApiException::notFound);
    }

    private List<PostDto> query(String where, UUID viewerId, Object... args) {
        Object[] all = new Object[args.length + 1];
        all[0] = viewerId;
        System.arraycopy(args, 0, all, 1, args.length);
        return jdbc.query("""
                select p.id, p.kind, p.day, p.created_at, p.payload, u.id as author_id, u.display_name, u.avatar_version,
                  (select count(*) from friend_post_cheer c where c.post_id = p.id) as cheers,
                  exists (select 1 from friend_post_cheer c where c.post_id = p.id and c.user_id = ?) as cheered
                from friend_post p join app_user u on u.id = p.user_id
                where u.status = 'ACTIVE'""" + " and " + where + " order by p.created_at desc limit 60", (rs, i) -> {
            UUID author = rs.getObject("author_id", UUID.class);
            Map<String, Object> data;
            try {
                data = json.readValue(rs.getString("payload"), new TypeReference<Map<String, Object>>() {});
            } catch (RuntimeException e) {
                data = Map.of();
            }
            return new PostDto(rs.getObject("id", UUID.class), Kind.valueOf(rs.getString("kind")), rs.getObject("day", LocalDate.class),
                    rs.getTimestamp("created_at").toInstant(),
                    new Author(author, FriendService.firstName(rs.getString("display_name")),
                            AppUser.pictureUrl(author, (Integer) rs.getObject("avatar_version"))),
                    author.equals(viewerId), data, rs.getInt("cheers"), rs.getBoolean("cheered"));
        }, all);
    }

    /** the friends who accept the friends' notifications, told once a post, one an hour per member at most */
    private void announce(UUID userId, Kind kind) {
        Integer recent = jdbc.queryForObject("""
                select count(*) from friend_post where user_id = ? and created_at > now() - interval '1 hour'""", Integer.class, userId);
        if (recent != null && recent > 1) {
            return;
        }
        String name = FriendService.firstName(jdbc.queryForObject("select display_name from app_user where id = ?", String.class, userId));
        List<UUID> to = jdbc.queryForList("""
                select f.id from (select user_b as id from friendship where user_a = ?
                                  union select user_a from friendship where user_b = ?) f
                left join notification_pref p on p.user_id = f.id
                where coalesce(p.friends_enabled, true)""", UUID.class, userId, userId);
        if (to.isEmpty()) {
            return;
        }
        Map<String, String> args = Map.of("name", name, "kind", kind.name());
        later(() -> to.forEach(friend -> push.notify(friend, PushService.Kind.FRIEND_POST, args)));
    }

    private boolean accepts(UUID userId) {
        return jdbc.queryForList("select friends_enabled from notification_pref where user_id = ?", Boolean.class, userId).stream().findFirst()
                .orElse(true);
    }

    /** after the commit, off the request: the member never waits for the phones */
    private void later(Runnable job) {
        Runnable send = () -> executor.execute(() -> {
            try {
                job.run();
            } catch (RuntimeException e) {
                log.info("Friend post notification not sent: {}", e.getMessage());
            }
        });
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send.run();
                }
            });
        } else {
            send.run();
        }
    }
}
