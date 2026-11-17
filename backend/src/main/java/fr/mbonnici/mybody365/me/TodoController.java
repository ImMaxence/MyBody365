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

    public record Todo(boolean passkey, boolean drive, long adminRequests, int adminFeedback, int adminErrors) {}

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
        return new Todo(passkeys == null || passkeys == 0, noDrive, admin ? requests.countByStatus(AccessRequest.Status.PENDING) : 0,
                admin ? feedback.open() : 0, admin ? errors.open() : 0);
    }
}
