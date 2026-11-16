package fr.mbonnici.mybody365.friends;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.config.AppProperties;
import fr.mbonnici.mybody365.photo.Photo;
import fr.mbonnici.mybody365.photo.PhotoAccessRule;
import fr.mbonnici.mybody365.push.PushService;
import fr.mbonnici.mybody365.tracking.Streaks;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.AppUser;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.Locale;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Friends: a personal link (or its QR code), or a request sent to a username, makes two members friends;
 * friends see each other's first name, picture and flame, nothing else, unless a photo is shared with them
 * one by one.
 */
@Service
public class FriendService implements PhotoAccessRule {

    private static final Duration INVITE_LIFE = Duration.ofDays(7);
    private static final SecureRandom RANDOM = new SecureRandom();

    public record Invite(String url, Instant expiresAt) {}

    public record FriendDto(UUID id, String name, String username, String avatarUrl, int streak, boolean todayDone, Instant since,
            int sharedWithMe, boolean nudgedToday) {}

    /** where I stand with a member found by username */
    public enum Relation { SELF, FRIEND, SENT, RECEIVED, NONE }

    /** a member found by their exact username: the first name and the username, the picture only once they asked me */
    public record MemberDto(UUID id, String name, String username, String avatarUrl, Relation relation) {}

    public record RequestDto(UUID id, String name, String username, String avatarUrl, Instant sentAt) {}

    public record Requests(List<RequestDto> received, List<RequestDto> sent) {}

    public static final Pattern USERNAME = Pattern.compile("[a-z0-9._]{3,20}");
    private static final int MAX_PENDING = 50;

    public record SharedPhoto(UUID id, LocalDate day, Photo.Pose pose, UUID ownerId, String ownerName, String url, String thumbUrl) {}

    private final JdbcTemplate jdbc;
    private final AppProperties props;
    private final PushService push;

    public FriendService(JdbcTemplate jdbc, AppProperties props, PushService push) {
        this.jdbc = jdbc;
        this.props = props;
        this.push = push;
    }

    /** a new link replaces the previous ones; the token is shown once and only its hash is kept */
    @Transactional
    public Invite invite(UUID userId) {
        byte[] raw = new byte[24];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        Instant expires = Instant.now().plus(INVITE_LIFE);
        jdbc.update("delete from friend_invite where user_id = ?", userId);
        jdbc.update("insert into friend_invite (token_hash, user_id, expires_at) values (?, ?, ?)", hash(token), userId, Timestamp.from(expires));
        // in the fragment: never sent to a server, never in a log
        return new Invite(props.url() + "/friends/add#" + token, expires);
    }

    @Transactional
    public FriendDto accept(UUID userId, String token) {
        if (token == null || token.length() < 20 || token.length() > 64) {
            throw ApiException.badRequest("invite_invalid");
        }
        UUID inviter = jdbc.queryForList("select user_id from friend_invite where token_hash = ? and expires_at > now()", UUID.class,
                hash(token)).stream().findFirst().orElseThrow(() -> ApiException.badRequest("invite_invalid"));
        if (inviter.equals(userId)) {
            throw ApiException.badRequest("self_invite");
        }
        if (friends(userId, inviter)) {
            throw ApiException.conflict("already_friends");
        }
        // a pending request between the two is answered by the link
        jdbc.update("delete from friend_request where (from_id = ? and to_id = ?) or (from_id = ? and to_id = ?)", userId, inviter, inviter,
                userId);
        UUID a = min(userId, inviter);
        UUID b = max(userId, inviter);
        try {
            jdbc.update("insert into friendship (user_a, user_b) values (?, ?)", a, b);
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("already_friends");
        }
        return list(userId).stream().filter(f -> f.id().equals(inviter)).findFirst().orElseThrow();
    }

    // ── requests by username ─────────────────────────────────────────────────

    /** "@Lea.Martin " → "lea.martin"; null when it cannot be a username */
    public static String normalize(String username) {
        if (username == null) {
            return null;
        }
        String u = username.strip().toLowerCase(Locale.ROOT);
        if (u.startsWith("@")) {
            u = u.substring(1);
        }
        return USERNAME.matcher(u).matches() ? u : null;
    }

    /** an exact match only (no list, no prefix search): a username has to be known to find someone */
    public MemberDto find(UUID viewerId, String username) {
        String u = normalize(username);
        if (u == null) {
            throw ApiException.notFound();
        }
        Map<String, Object> row = jdbc.queryForList("select id, display_name, username, avatar_url, avatar_version from app_user"
                + " where username = ? and status = 'ACTIVE'", u).stream().findFirst().orElseThrow(ApiException::notFound);
        UUID id = (UUID) row.get("id");
        Relation rel = relation(viewerId, id);
        // the picture once there is a link between us (a friend, or a request they sent me)
        String picture = rel == Relation.SELF || rel == Relation.FRIEND || rel == Relation.RECEIVED
                ? AppUser.pictureUrl(id, (Integer) row.get("avatar_version"), (String) row.get("avatar_url")) : null;
        return new MemberDto(id, firstName((String) row.get("display_name")), (String) row.get("username"), picture, rel);
    }

    private Relation relation(UUID me, UUID other) {
        if (me.equals(other)) {
            return Relation.SELF;
        }
        if (friends(me, other)) {
            return Relation.FRIEND;
        }
        if (pending(me, other)) {
            return Relation.SENT;
        }
        return pending(other, me) ? Relation.RECEIVED : Relation.NONE;
    }

    private boolean pending(UUID from, UUID to) {
        return !jdbc.queryForList("select 1 from friend_request where from_id = ? and to_id = ?", Integer.class, from, to).isEmpty();
    }

    /**
     * Asks a member to be friends. When they had already asked me, it is a match: we are friends at once.
     * Returns where we stand afterwards (SENT or FRIEND).
     */
    @Transactional
    public Relation request(UUID userId, String username) {
        MemberDto m = find(userId, username);
        switch (m.relation()) {
            case SELF -> throw ApiException.badRequest("self_request");
            case FRIEND -> throw ApiException.conflict("already_friends");
            case SENT -> {
                return Relation.SENT;
            }
            case RECEIVED -> {
                acceptRequest(userId, m.id());
                return Relation.FRIEND;
            }
            default -> { }
        }
        Integer pendingCount = jdbc.queryForObject("select count(*) from friend_request where from_id = ?", Integer.class, userId);
        if (pendingCount != null && pendingCount >= MAX_PENDING) {
            throw ApiException.conflict("too_many_requests");
        }
        jdbc.update("insert into friend_request (from_id, to_id) values (?, ?) on conflict do nothing", userId, m.id());
        notifyFriend(m.id(), userId, PushService.Kind.FRIEND_REQUEST);
        return Relation.SENT;
    }

    public Requests requests(UUID userId) {
        String sql = """
                select u.id, u.display_name, u.username, u.avatar_url, u.avatar_version, r.created_at
                from friend_request r join app_user u on u.id = r.%s
                where r.%s = ? and u.status = 'ACTIVE' order by r.created_at desc""";
        // the picture of who asked me; not of who I asked (they have not said yes)
        List<RequestDto> received = jdbc.query(sql.formatted("from_id", "to_id"), (rs, i) -> {
            UUID id = rs.getObject("id", UUID.class);
            Integer version = rs.getObject("avatar_version", Integer.class);
            return new RequestDto(id, firstName(rs.getString("display_name")), rs.getString("username"),
                    AppUser.pictureUrl(id, version, rs.getString("avatar_url")), rs.getTimestamp("created_at").toInstant());
        }, userId);
        List<RequestDto> sent = jdbc.query(sql.formatted("to_id", "from_id"), (rs, i) -> new RequestDto(rs.getObject("id", UUID.class),
                firstName(rs.getString("display_name")), rs.getString("username"), null, rs.getTimestamp("created_at").toInstant()), userId);
        return new Requests(received, sent);
    }

    /** yes to a request: the friendship, and a word to the one who asked */
    @Transactional
    public FriendDto acceptRequest(UUID userId, UUID fromId) {
        int n = jdbc.update("delete from friend_request where from_id = ? and to_id = ?", fromId, userId);
        if (n == 0) {
            throw ApiException.notFound();
        }
        jdbc.update("delete from friend_request where from_id = ? and to_id = ?", userId, fromId);
        jdbc.update("insert into friendship (user_a, user_b) values (?, ?) on conflict do nothing", min(userId, fromId), max(userId, fromId));
        notifyFriend(fromId, userId, PushService.Kind.FRIEND_ACCEPTED);
        return list(userId).stream().filter(f -> f.id().equals(fromId)).findFirst().orElseThrow(ApiException::notFound);
    }

    /** no to a request, or a request withdrawn: the asker is not told */
    @Transactional
    public void dropRequest(UUID userId, UUID otherId) {
        int n = jdbc.update("delete from friend_request where (from_id = ? and to_id = ?) or (from_id = ? and to_id = ?)", otherId, userId,
                userId, otherId);
        if (n == 0) {
            throw ApiException.notFound();
        }
    }

    private void notifyFriend(UUID to, UUID from, PushService.Kind kind) {
        Boolean accepts = jdbc.queryForList("select friends_enabled from notification_pref where user_id = ?", Boolean.class, to).stream()
                .findFirst().orElse(true);
        if (accepts) {
            String name = firstName(jdbc.queryForObject("select display_name from app_user where id = ?", String.class, from));
            push.notify(to, kind, Map.of("name", name));
        }
    }

    /** a member's own picture: themselves, their friends, who they asked to be friends with */
    public boolean canSeePicture(UUID ownerId, UUID viewerId) {
        return ownerId.equals(viewerId) || friends(ownerId, viewerId) || pending(ownerId, viewerId);
    }

    public boolean friends(UUID x, UUID y) {
        return !jdbc.queryForList("select 1 from friendship where user_a = ? and user_b = ?", Integer.class, min(x, y), max(x, y)).isEmpty();
    }

    public List<FriendDto> list(UUID userId) {
        LocalDate today = TrackingService.today();
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select u.id, u.display_name, u.username, u.avatar_url, u.avatar_version, f.created_at,
                  (select count(*) from photo_share s join photo p on p.id = s.photo_id where s.friend_id = ? and p.user_id = u.id) as shared,
                  exists (select 1 from friend_nudge n where n.from_id = ? and n.to_id = u.id and n.day = ?) as nudged
                from friendship f join app_user u on u.id = case when f.user_a = ? then f.user_b else f.user_a end
                where (f.user_a = ? or f.user_b = ?) and u.status = 'ACTIVE'
                order by lower(u.display_name)""", userId, userId, today, userId, userId, userId);
        List<FriendDto> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            UUID id = (UUID) r.get("id");
            Set<LocalDate> done = new HashSet<>(jdbc.queryForList(
                    "select day from body_log where user_id = ? and weight_kg is not null and day > ?", LocalDate.class, id,
                    today.minusDays(800)));
            Streaks.Result s = Streaks.compute(done, today);
            out.add(new FriendDto(id, firstName((String) r.get("display_name")), (String) r.get("username"),
                    AppUser.pictureUrl(id, (Integer) r.get("avatar_version"), (String) r.get("avatar_url")), s.days(), s.todayDone(),
                    ((Timestamp) r.get("created_at")).toInstant(), ((Number) r.get("shared")).intValue(), (Boolean) r.get("nudged")));
        }
        return out;
    }

    /** a friendship ends both ways, with the photos shared in it */
    @Transactional
    public void remove(UUID userId, UUID friendId) {
        int n = jdbc.update("delete from friendship where user_a = ? and user_b = ?", min(userId, friendId), max(userId, friendId));
        if (n == 0) {
            throw ApiException.notFound();
        }
        jdbc.update("delete from photo_share where friend_id = ? and photo_id in (select id from photo where user_id = ?)", friendId, userId);
        jdbc.update("delete from photo_share where friend_id = ? and photo_id in (select id from photo where user_id = ?)", userId, friendId);
    }

    /** a reminder on the friend's phone, once a day, if they accept friends' nudges */
    @Transactional
    public int nudge(UUID userId, UUID friendId) {
        if (!friends(userId, friendId)) {
            throw ApiException.forbidden("not_friends");
        }
        try {
            jdbc.update("insert into friend_nudge (from_id, to_id, day) values (?, ?, ?)", userId, friendId, TrackingService.today());
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("nudge_too_soon");
        }
        Boolean accepts = jdbc.queryForList("select friends_enabled from notification_pref where user_id = ?", Boolean.class, friendId).stream()
                .findFirst().orElse(true);
        if (!accepts) {
            return 0;
        }
        String name = firstName(jdbc.queryForObject("select display_name from app_user where id = ?", String.class, userId));
        return push.notify(friendId, PushService.Kind.NUDGE, Map.of("name", name));
    }

    // ── photos shared one by one ─────────────────────────────────────────────

    public List<UUID> sharesOf(UUID userId, UUID photoId) {
        ownPhoto(userId, photoId);
        return jdbc.queryForList("select friend_id from photo_share where photo_id = ?", UUID.class, photoId);
    }

    public void share(UUID userId, UUID photoId, UUID friendId) {
        ownPhoto(userId, photoId);
        if (!friends(userId, friendId)) {
            throw ApiException.forbidden("not_friends");
        }
        jdbc.update("insert into photo_share (photo_id, friend_id) values (?, ?) on conflict do nothing", photoId, friendId);
    }

    public void unshare(UUID userId, UUID photoId, UUID friendId) {
        ownPhoto(userId, photoId);
        jdbc.update("delete from photo_share where photo_id = ? and friend_id = ?", photoId, friendId);
    }

    public List<SharedPhoto> sharedWithMe(UUID userId) {
        return jdbc.query("""
                select p.id, p.day, p.pose, p.user_id, u.display_name from photo_share s
                join photo p on p.id = s.photo_id join app_user u on u.id = p.user_id
                where s.friend_id = ? and u.status = 'ACTIVE' order by p.day desc, s.created_at desc limit 200""",
                (rs, i) -> {
                    UUID id = rs.getObject("id", UUID.class);
                    return new SharedPhoto(id, rs.getObject("day", LocalDate.class), Photo.Pose.valueOf(rs.getString("pose")),
                            rs.getObject("user_id", UUID.class), firstName(rs.getString("display_name")), "/api/photos/" + id + "/full",
                            "/api/photos/" + id + "/thumb");
                }, userId);
    }

    /** a friend it was shared with (while still friends) may see the photo */
    @Override
    public boolean canView(Photo photo, UUID viewerId) {
        return !jdbc.queryForList("select 1 from photo_share where photo_id = ? and friend_id = ?", Integer.class, photo.getId(), viewerId)
                .isEmpty() && friends(photo.getUserId(), viewerId);
    }

    private void ownPhoto(UUID userId, UUID photoId) {
        if (jdbc.queryForList("select 1 from photo where id = ? and user_id = ?", Integer.class, photoId, userId).isEmpty()) {
            throw ApiException.notFound();
        }
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    static String firstName(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            return "?";
        }
        String first = displayName.strip().split("\\s+")[0];
        return first.length() > 40 ? first.substring(0, 40) : first;
    }

    private static UUID min(UUID x, UUID y) {
        return x.toString().compareTo(y.toString()) < 0 ? x : y;
    }

    private static UUID max(UUID x, UUID y) {
        return x.toString().compareTo(y.toString()) < 0 ? y : x;
    }
}
