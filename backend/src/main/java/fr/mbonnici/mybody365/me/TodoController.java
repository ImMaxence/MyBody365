package fr.mbonnici.mybody365.me;

import fr.mbonnici.mybody365.access.AccessRequest;
import fr.mbonnici.mybody365.access.AccessRequestRepository;
import fr.mbonnici.mybody365.backup.DriveService;
import fr.mbonnici.mybody365.support.ErrorLogService;
import fr.mbonnici.mybody365.support.FeedbackService;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.UserService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * What is waiting for the member, shown as red dots in the app: no passkey yet (the way back in without
 * Google), no automatic backup on Google Drive, and for the admins the requests, the feedback and the
 * errors to look at.
 */
@RestController
public class TodoController {

    /**
     * 1.12: also what waits in the other tabs: friend requests and challenge invitations (Today), the shopping list
     * (Meals), the photo of the day not taken yet by someone who takes them (Photos)
     */
    public record Todo(boolean passkey, boolean drive, long adminRequests, int adminFeedback, int adminErrors, int friendRequests,
            int challengeInvites, int shoppingLeft, boolean photoToday) {}

    private final UserService users;
    private final JdbcTemplate jdbc;
    private final DriveService drive;
    private final AccessRequestRepository requests;
    private final FeedbackService feedback;
    private final ErrorLogService errors;

    public TodoController(UserService users, JdbcTemplate jdbc, DriveService drive, AccessRequestRepository requests, FeedbackService feedback,
            ErrorLogService errors) {
        this.users = users;
        this.jdbc = jdbc;
        this.drive = drive;
        this.requests = requests;
        this.feedback = feedback;
        this.errors = errors;
    }

    @GetMapping("/api/me/todo")
    public Todo todo(Authentication auth) {
        AppUser me = users.current(auth);
        Integer passkeys = jdbc.queryForObject("""
                select count(*) from user_credentials c join user_entities e on e.id = c.user_entity_user_id where e.name = ?""",
                Integer.class, me.getEmail());
        boolean noDrive = drive.configured() && !drive.status(me.getId()).connected();
        boolean admin = users.isAdmin(me);
        java.util.UUID id = me.getId();
        java.time.LocalDate today = fr.mbonnici.mybody365.tracking.TrackingService.today();
        int friendRequests = count("select count(*) from friend_request where to_id = ?", id);
        int invites = count("""
                select count(*) from challenge_member m join challenge c on c.id = m.challenge_id
                where m.user_id = ? and m.status = 'INVITED' and c.end_day >= ?""", id, today);
        int shopping = count("select count(*) from shopping_item where user_id = ? and not checked", id);
        // only for someone who takes them (one in the last two weeks) and keeps the reminder on
        boolean photo = count("""
                select count(*) from photo p where p.user_id = ? and p.day >= ? and p.day < ?
                  and coalesce((select photo_enabled from notification_pref n where n.user_id = p.user_id), true)""", id, today.minusDays(14), today) > 0
                && count("select count(*) from photo where user_id = ? and day = ?", id, today) == 0;
        return new Todo(passkeys == null || passkeys == 0, noDrive, admin ? requests.countByStatus(AccessRequest.Status.PENDING) : 0,
                admin ? feedback.open() : 0, admin ? errors.open() : 0, friendRequests, invites, shopping, photo);
    }

    private int count(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }
}
