package fr.mbonnici.mybody365.friends;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.push.PushService;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.AppUser;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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

/**
 * Challenges between friends (1.9): something to do every day for 7, 14 or 30 days (WEIGH: a weigh-in; WATER: one's
 * water goal, 8 glasses without one; MEALS: three meals noted; PHOTO: the photo of the day), started by a member with
 * the friends they invite. Each day is read from the data the app already keeps: nothing to tick by hand, nothing to
 * cheat with. The scoreboard shows each member's days done; the friends invited are told once (not on a locked screen:
 * no figure). Kept 60 days after their end (RetentionJob).
 */
@Service
public class Challenges {

    private static final Logger log = LoggerFactory.getLogger(Challenges.class);
    /** friends invited at once, challenges of one's own still running */
    static final int MAX_FRIENDS = 10;
    static final int MAX_OPEN = 5;
    /** an ended challenge stays on the list this long */
    static final int SHOWN_AFTER_END = 14;

    public enum Kind { WEIGH, WATER, MEALS, PHOTO }

    public enum Status { INVITED, JOINED, DECLINED }

    public record CreateInput(@NotNull Kind kind, @NotNull @Min(3) @Max(30) Integer days, @NotNull @Size(min = 1, max = MAX_FRIENDS) List<UUID> friends) {}

    /** a member: the days done so far (one flag a day, from the start to today or the end), their rank among the joined */
    public record MemberDto(UUID id, String name, String avatarUrl, Status status, boolean me, int done, List<Boolean> days, int rank) {}

    public record ChallengeDto(UUID id, Kind kind, LocalDate startDay, LocalDate endDay, int length, int elapsed, boolean ended, boolean owner,
            String ownerName, Status myStatus, List<MemberDto> members) {}

    private final JdbcTemplate jdbc;
    private final FriendService friends;
    private final PushService push;
    private final TaskExecutor executor;

    public Challenges(JdbcTemplate jdbc, FriendService friends, PushService push, @Qualifier("applicationTaskExecutor") TaskExecutor executor) {
        this.jdbc = jdbc;
        this.friends = friends;
        this.push = push;
        this.executor = executor;
    }

    /** a new challenge from today, with friends only */
    @Transactional
    public ChallengeDto create(UUID userId, CreateInput in) {
        LocalDate today = TrackingService.today();
        Integer open = jdbc.queryForObject("select count(*) from challenge where owner_id = ? and end_day >= ?", Integer.class, userId, today);
        if (open != null && open >= MAX_OPEN) {
            throw ApiException.conflict("too_many_challenges");
        }
        Set<UUID> invited = new LinkedHashSet<>(in.friends());
        invited.remove(userId);
        if (invited.isEmpty()) {
            throw ApiException.badRequest("validation_failed");
        }
        for (UUID f : invited) {
            if (!friends.friends(userId, f)) {
                throw ApiException.forbidden("not_friends");
            }
        }
        UUID id = UUID.randomUUID();
        jdbc.update("insert into challenge (id, owner_id, kind, start_day, end_day) values (?, ?, ?, ?, ?)", id, userId, in.kind().name(), today,
                today.plusDays(in.days() - 1L));
        jdbc.update("insert into challenge_member (challenge_id, user_id, status, responded_at) values (?, ?, 'JOINED', now())", id, userId);
        for (UUID f : invited) {
            jdbc.update("insert into challenge_member (challenge_id, user_id, status) values (?, ?, 'INVITED')", id, f);
        }
        String name = FriendService.firstName(jdbc.queryForObject("select display_name from app_user where id = ?", String.class, userId));
        List<UUID> to = jdbc.queryForList("""
                select m.user_id from challenge_member m left join notification_pref p on p.user_id = m.user_id
                where m.challenge_id = ? and m.status = 'INVITED' and coalesce(p.friends_enabled, true)""", UUID.class, id);
        Map<String, String> args = Map.of("name", name, "kind", in.kind().name(), "days", String.valueOf(in.days()));
        later(() -> to.forEach(f -> push.notify(f, PushService.Kind.FRIEND_CHALLENGE, args)));
        return one(id, userId);
    }

    /** mine: running ones and invitations first (newest first), then the ones ended lately */
    public List<ChallengeDto> mine(UUID userId) {
        LocalDate today = TrackingService.today();
        List<UUID> ids = jdbc.queryForList("""
                select c.id from challenge c join challenge_member m on m.challenge_id = c.id
                where m.user_id = ? and m.status <> 'DECLINED' and c.end_day >= ?
                order by (c.end_day < ?), c.start_day desc, c.created_at desc""", UUID.class, userId, today.minusDays(SHOWN_AFTER_END), today);
        return ids.stream().map(id -> one(id, userId)).toList();
    }

    /** an invitation answered, while the challenge is still on */
    @Transactional
    public ChallengeDto respond(UUID userId, UUID id, boolean join) {
        Status status = status(id, userId);
        if (status == null) {
            throw ApiException.notFound();
        }
        LocalDate end = jdbc.queryForObject("select end_day from challenge where id = ?", LocalDate.class, id);
        if (end != null && end.isBefore(TrackingService.today())) {
            throw ApiException.badRequest("challenge_ended");
        }
        if (status == Status.INVITED) {
            jdbc.update("update challenge_member set status = ?, responded_at = now() where challenge_id = ? and user_id = ?",
                    (join ? Status.JOINED : Status.DECLINED).name(), id, userId);
        }
        return one(id, userId);
    }

    /** its owner calls it off for everyone; a member leaves it */
    @Transactional
    public void leave(UUID userId, UUID id) {
        if (status(id, userId) == null) {
            throw ApiException.notFound();
        }
        int owned = jdbc.update("delete from challenge where id = ? and owner_id = ?", id, userId);
        if (owned == 0) {
            jdbc.update("delete from challenge_member where challenge_id = ? and user_id = ?", id, userId);
        }
    }

    private Status status(UUID id, UUID userId) {
        return jdbc.queryForList("select status from challenge_member where challenge_id = ? and user_id = ?", String.class, id, userId).stream()
                .findFirst().map(Status::valueOf).orElse(null);
    }

    /** a challenge as one of its members sees it */
    ChallengeDto one(UUID id, UUID viewerId) {
        Map<String, Object> c = jdbc.queryForMap("""
                select c.kind, c.start_day, c.end_day, c.owner_id, u.display_name from challenge c join app_user u on u.id = c.owner_id
                where c.id = ?""", id);
        Kind kind = Kind.valueOf((String) c.get("kind"));
        LocalDate start = ((java.sql.Date) c.get("start_day")).toLocalDate();
        LocalDate end = ((java.sql.Date) c.get("end_day")).toLocalDate();
        LocalDate today = TrackingService.today();
        LocalDate last = end.isBefore(today) ? end : today;
        int length = (int) java.time.temporal.ChronoUnit.DAYS.between(start, end) + 1;
        int elapsed = last.isBefore(start) ? 0 : (int) java.time.temporal.ChronoUnit.DAYS.between(start, last) + 1;
        UUID owner = (UUID) c.get("owner_id");

        List<Map<String, Object>> rows = jdbc.queryForList("""
                select m.user_id, m.status, u.display_name, u.avatar_version from challenge_member m join app_user u on u.id = m.user_id
                where m.challenge_id = ? and m.status <> 'DECLINED' and u.status = 'ACTIVE' order by m.invited_at""", id);
        List<MemberDto> members = new ArrayList<>();
        Status mine = null;
        for (Map<String, Object> r : rows) {
            UUID user = (UUID) r.get("user_id");
            Status status = Status.valueOf((String) r.get("status"));
            Set<LocalDate> done = status == Status.JOINED && elapsed > 0 ? doneDays(kind, user, start, last) : Set.of();
            List<Boolean> days = new ArrayList<>();
            for (int i = 0; i < elapsed; i++) {
                days.add(done.contains(start.plusDays(i)));
            }
            if (user.equals(viewerId)) {
                mine = status;
            }
            members.add(new MemberDto(user, FriendService.firstName((String) r.get("display_name")), AppUser.pictureUrl(user,
                    (Integer) r.get("avatar_version")), status, user.equals(viewerId), done.size(), days, 0));
        }
        // the joined ones ranked by their days done (ties share a rank), the invited ones after them
        List<MemberDto> joined = members.stream().filter(m -> m.status() == Status.JOINED).sorted(Comparator.comparingInt(MemberDto::done).reversed())
                .toList();
        List<MemberDto> ranked = new ArrayList<>();
        for (int i = 0; i < joined.size(); i++) {
            MemberDto m = joined.get(i);
            int rank = i > 0 && joined.get(i - 1).done() == m.done() ? ranked.get(i - 1).rank() : i + 1;
            ranked.add(new MemberDto(m.id(), m.name(), m.avatarUrl(), m.status(), m.me(), m.done(), m.days(), rank));
        }
        members.stream().filter(m -> m.status() != Status.JOINED).forEach(ranked::add);
        return new ChallengeDto(id, kind, start, end, length, elapsed, end.isBefore(today), owner.equals(viewerId),
                FriendService.firstName((String) c.get("display_name")), mine, ranked);
    }

    /** 1.17: a running challenge whose day is not done yet: its kind, the day it is (1 = the first), its length, a friend in it */
    public record Left(Kind kind, int day, int length, String friend) {}

    /** 1.17: the challenges a member joined, running today, whose day is not done yet (the daily reminder) */
    public List<Left> leftToday(UUID userId, LocalDate today) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select c.id, c.kind, c.start_day, c.end_day,
                  (select u.display_name from challenge_member o join app_user u on u.id = o.user_id
                   where o.challenge_id = c.id and o.user_id <> ? and o.status = 'JOINED' and u.status = 'ACTIVE'
                   order by o.invited_at limit 1) as friend
                from challenge c join challenge_member m on m.challenge_id = c.id
                where m.user_id = ? and m.status = 'JOINED' and c.start_day <= ? and c.end_day >= ?
                order by c.start_day, c.created_at""", userId, userId, today, today);
        List<Left> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Kind kind = Kind.valueOf((String) r.get("kind"));
            if (!doneDays(kind, userId, today, today).isEmpty()) {
                continue;
            }
            LocalDate start = ((java.sql.Date) r.get("start_day")).toLocalDate();
            LocalDate end = ((java.sql.Date) r.get("end_day")).toLocalDate();
            String friend = (String) r.get("friend");
            out.add(new Left(kind, (int) java.time.temporal.ChronoUnit.DAYS.between(start, today) + 1,
                    (int) java.time.temporal.ChronoUnit.DAYS.between(start, end) + 1, friend == null ? "" : FriendService.firstName(friend)));
        }
        return out;
    }

    /** the days a member did it, read from what the app keeps */
    private Set<LocalDate> doneDays(Kind kind, UUID user, LocalDate from, LocalDate to) {
        String sql = switch (kind) {
            case WEIGH -> "select day from body_log where user_id = ? and weight_kg is not null and day between ? and ?";
            case WATER -> """
                    select w.day from water_log w join app_user u on u.id = w.user_id
                    where w.user_id = ? and w.day between ? and ? and w.glasses >= coalesce(u.water_goal, 8)""";
            case MEALS -> "select day from meal_entry where user_id = ? and day between ? and ? group by day having count(distinct slot) >= 3";
            case PHOTO -> "select distinct day from photo where user_id = ? and day between ? and ?";
        };
        return new HashSet<>(jdbc.queryForList(sql, LocalDate.class, user, from, to));
    }

    /** after the commit, off the request */
    private void later(Runnable job) {
        Runnable send = () -> executor.execute(() -> {
            try {
                job.run();
            } catch (RuntimeException e) {
                log.info("Challenge notification not sent: {}", e.getMessage());
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
