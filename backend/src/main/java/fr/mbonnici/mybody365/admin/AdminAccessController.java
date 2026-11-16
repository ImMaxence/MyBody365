package fr.mbonnici.mybody365.admin;

import fr.mbonnici.mybody365.access.AccessRequest;
import fr.mbonnici.mybody365.access.AccessRequestRepository;
import fr.mbonnici.mybody365.admin.AdminDtos.AuditDto;
import fr.mbonnici.mybody365.admin.AdminDtos.Decision;
import fr.mbonnici.mybody365.admin.AdminDtos.RequestDto;
import fr.mbonnici.mybody365.admin.AuditService.Action;
import fr.mbonnici.mybody365.admin.AuditService.Target;
import fr.mbonnici.mybody365.auth.AccountLink;
import fr.mbonnici.mybody365.auth.AccountLinkService;
import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.AppUserRepository;
import fr.mbonnici.mybody365.user.UserService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Admin: the access requests of the sign-in screen, and the journal of admin actions. */
@RestController
@RequestMapping("/api/admin")
public class AdminAccessController {

    private final AccessRequestRepository requests;
    private final AppUserRepository userRepository;
    private final UserService users;
    private final AccountLinkService links;
    private final AuditService audit;
    private final AuditRepository auditRepository;
    private final AdminViews views;

    public AdminAccessController(AccessRequestRepository requests, AppUserRepository userRepository, UserService users,
            AccountLinkService links, AuditService audit, AuditRepository auditRepository, AdminViews views) {
        this.requests = requests;
        this.userRepository = userRepository;
        this.users = users;
        this.links = links;
        this.audit = audit;
        this.auditRepository = auditRepository;
        this.views = views;
    }

    /** @param status PENDING (default) or DECIDED (the last 100 approved or rejected) */
    @GetMapping("/access-requests")
    @Transactional(readOnly = true)
    public List<RequestDto> list(@RequestParam(defaultValue = "PENDING") String status) {
        Map<UUID, AppUser> byId = views.usersById();
        List<AccessRequest> found = "DECIDED".equals(status)
                ? requests.findTop100ByStatusNotOrderByDecidedAtDesc(AccessRequest.Status.PENDING)
                : requests.findByStatusOrderByCreatedAtDesc(AccessRequest.Status.PENDING);
        return found.stream().map(r -> AdminDtos.request(r,
                r.getDecidedBy() != null && byId.containsKey(r.getDecidedBy()) ? byId.get(r.getDecidedBy()).getEmail() : null,
                userRepository.existsByEmail(r.getEmail()))).toList();
    }

    /**
     * New access: creates the account (if needed) and an invitation link. Lost access: a recovery
     * link for the existing account. Either way the link is in the answer, to send to the person.
     */
    @PostMapping("/access-requests/{id}/approve")
    @Transactional
    public Decision approve(@PathVariable UUID id, Authentication auth) {
        AppUser me = users.current(auth);
        AccessRequest request = pending(id);
        AppUser user = userRepository.findByEmail(request.getEmail()).orElse(null);
        AccountLink.Kind kind;
        if (request.getKind() == AccessRequest.Kind.NEW_ACCESS) {
            if (user == null) {
                user = userRepository.save(AppUser.create(request.getEmail(), request.getName(), AppUser.Role.USER));
                audit.record(me, Action.USER_CREATED, Target.user(user), "access request");
            }
            kind = user.getLastLoginAt() == null ? AccountLink.Kind.INVITE : AccountLink.Kind.RECOVERY;
        } else {
            if (user == null) {
                throw ApiException.conflict("no_account");
            }
            kind = AccountLink.Kind.RECOVERY;
        }
        if (user.getStatus() != AppUser.Status.ACTIVE) {
            throw ApiException.conflict("account_suspended");
        }
        request.decide(AccessRequest.Status.APPROVED, me.getId());
        audit.record(me, Action.ACCESS_APPROVED, Target.user(user), request.getKind().name());
        AccountLinkService.Issued issued = links.issue(user, kind, me.getId());
        audit.record(me, Action.LINK_CREATED, Target.user(user), kind.name());
        return new Decision(AdminDtos.request(request, me.getEmail(), true), views.user(user, me),
                views.link(issued.link(), user, me.getEmail(), issued.url()));
    }

    @PostMapping("/access-requests/{id}/reject")
    @Transactional
    public RequestDto reject(@PathVariable UUID id, Authentication auth) {
        AppUser me = users.current(auth);
        AccessRequest request = pending(id);
        request.decide(AccessRequest.Status.REJECTED, me.getId());
        audit.record(me, Action.ACCESS_REJECTED, new Target("ACCESS_REQUEST", request.getId().toString(), request.getEmail()),
                request.getKind().name());
        return AdminDtos.request(request, me.getEmail(), userRepository.existsByEmail(request.getEmail()));
    }

    /** The journal, newest first, 50 lines at a time ({@code before}: the smallest id already shown). */
    @GetMapping("/audit")
    @Transactional(readOnly = true)
    public List<AuditDto> journal(@RequestParam(required = false) Long before, @RequestParam(defaultValue = "50") int limit) {
        return auditRepository.page(before == null ? Long.MAX_VALUE : before, PageRequest.of(0, Math.clamp(limit, 1, 200)))
                .stream().map(AdminDtos::audit).toList();
    }

    private AccessRequest pending(UUID id) {
        AccessRequest request = requests.findById(id).orElseThrow(ApiException::notFound);
        if (request.getStatus() != AccessRequest.Status.PENDING) {
            throw ApiException.conflict("already_decided");
        }
        return request;
    }
}
