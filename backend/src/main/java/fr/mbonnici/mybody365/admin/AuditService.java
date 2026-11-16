package fr.mbonnici.mybody365.admin;

import fr.mbonnici.mybody365.config.AppProperties;
import fr.mbonnici.mybody365.config.ClientIp;
import fr.mbonnici.mybody365.user.AppUser;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Writes the admin journal: who did what to whom, from which IP. */
@Service
public class AuditService {

    /** what the journal records; the app translates each name */
    public enum Action {
        USER_CREATED,
        USER_ROLE_CHANGED,
        USER_SUSPENDED,
        USER_REACTIVATED,
        USER_DELETED,
        USER_SESSIONS_ENDED,
        ACCESS_APPROVED,
        ACCESS_REJECTED,
        LINK_CREATED,
        LINK_REVOKED,
    }

    public record Target(String type, String id, String label) {
        public static Target user(AppUser u) {
            return new Target("USER", u.getId().toString(), u.getEmail());
        }
    }

    private final AuditRepository audit;
    private final AppProperties props;

    public AuditService(AuditRepository audit, AppProperties props) {
        this.audit = audit;
        this.props = props;
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public void record(AppUser actor, Action action, Target target, String details) {
        audit.save(new AuditEntry(actor.getId(), actor.getEmail(), action.name(),
                target == null ? null : target.type(), target == null ? null : target.id(),
                target == null ? null : truncate(target.label(), 254), truncate(details, 2000), ip()));
    }

    private String ip() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
            HttpServletRequest request = attrs.getRequest();
            return ClientIp.resolve(request, props.trustProxy());
        }
        return null;
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}
