package fr.mbonnici.mybody365.admin;

import fr.mbonnici.mybody365.access.AccessRequest;
import fr.mbonnici.mybody365.access.AccessRequestRepository;
import fr.mbonnici.mybody365.admin.AdminDtos.Created;
import fr.mbonnici.mybody365.admin.AdminDtos.CreateLink;
import fr.mbonnici.mybody365.admin.AdminDtos.CreateUser;
import fr.mbonnici.mybody365.admin.AdminDtos.LinkDto;
import fr.mbonnici.mybody365.admin.AdminDtos.Summary;
import fr.mbonnici.mybody365.admin.AdminDtos.UpdateUser;
import fr.mbonnici.mybody365.admin.AdminDtos.UserDto;
import fr.mbonnici.mybody365.admin.AuditService.Action;
import fr.mbonnici.mybody365.admin.AuditService.Target;
import fr.mbonnici.mybody365.auth.AccountLink;
import fr.mbonnici.mybody365.auth.AccountLinkRepository;
import fr.mbonnici.mybody365.auth.AccountLinkService;
import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.common.Emails;
import fr.mbonnici.mybody365.support.ErrorLogService;
import fr.mbonnici.mybody365.support.FeedbackService;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.AppUserRepository;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Admin: accounts (role, suspension, deletion) and their invitation / recovery links. */
@RestController
@RequestMapping("/api/admin")
public class AdminUsersController {

    private final AppUserRepository userRepository;
    private final UserService users;
    private final AccountLinkService linkService;
    private final AccountLinkRepository links;
    private final AccessRequestRepository requests;
    private final AuditService audit;
    private final AdminViews views;
    private final FeedbackService feedback;
    private final ErrorLogService errors;

    public AdminUsersController(AppUserRepository userRepository, UserService users, AccountLinkService linkService,
            AccountLinkRepository links, AccessRequestRepository requests, AuditService audit, AdminViews views, FeedbackService feedback,
            ErrorLogService errors) {
        this.userRepository = userRepository;
        this.users = users;
        this.linkService = linkService;
        this.links = links;
        this.requests = requests;
        this.audit = audit;
        this.views = views;
        this.feedback = feedback;
        this.errors = errors;
    }

    @GetMapping("/summary")
    @Transactional(readOnly = true)
    public Summary summary() {
        List<AppUser> all = userRepository.findAll();
        long admins = all.stream().filter(users::isAdmin).count();
        return new Summary(all.size(), admins, requests.countByStatus(AccessRequest.Status.PENDING),
                links.findActive(Instant.now()).size(), feedback.open(), errors.open());
    }

    @GetMapping("/users")
    @Transactional(readOnly = true)
    public List<UserDto> list(Authentication auth) {
        AppUser me = users.current(auth);
        return userRepository.findAllByOrderByCreatedAtAsc().stream().map(u -> views.user(u, me)).toList();
    }

    /** Adds an account by hand and returns its invitation link (shown once). */
    @PostMapping("/users")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Created create(@Valid @RequestBody CreateUser body, Authentication auth) {
        AppUser me = users.current(auth);
        String email = Emails.normalize(body.email());
        if (userRepository.existsByEmail(email)) {
            throw ApiException.conflict("email_taken");
        }
        AppUser user = userRepository.save(AppUser.create(email, body.displayName(), AppUser.Role.USER));
        audit.record(me, Action.USER_CREATED, Target.user(user), null);
        AccountLinkService.Issued issued = linkService.issue(user, AccountLink.Kind.INVITE, me.getId());
        audit.record(me, Action.LINK_CREATED, Target.user(user), "INVITE");
        return new Created(views.user(user, me), views.link(issued.link(), user, me.getEmail(), issued.url()));
    }

    @PatchMapping("/users/{id}")
    @Transactional
    public UserDto update(@PathVariable UUID id, @RequestBody UpdateUser body, Authentication auth) {
        AppUser me = users.current(auth);
        AppUser user = userRepository.findById(id).orElseThrow(ApiException::notFound);
        // 1.14: the bot keeps its role, its status and its quota, and no account becomes a bot
        if (users.isBot(user) || body.role() == AppUser.Role.BOT) {
            throw ApiException.forbidden("bot_account");
        }
        boolean protectedAccount = users.isEnvAdmin(user) || user.getId().equals(me.getId());
        if (body.role() != null && body.role() != user.getRole()) {
            if (protectedAccount) {
                throw ApiException.forbidden("protected_account");
            }
            String before = user.getRole().name();
            user.setRole(body.role());
            audit.record(me, Action.USER_ROLE_CHANGED, Target.user(user), before + " → " + body.role().name());
        }
        if (body.status() != null && body.status() != user.getStatus()) {
            if (protectedAccount) {
                throw ApiException.forbidden("protected_account");
            }
            user.setStatus(body.status());
            if (body.status() == AppUser.Status.SUSPENDED) {
                users.endSessions(user.getEmail());
                audit.record(me, Action.USER_SUSPENDED, Target.user(user), null);
            } else {
                audit.record(me, Action.USER_REACTIVATED, Target.user(user), null);
            }
        }
        if (body.storageQuotaMb() != null) {
            Integer quota = body.storageQuotaMb() < 0 ? null : Math.min(body.storageQuotaMb(), 1_048_576);
            if (!java.util.Objects.equals(quota, user.getStorageQuotaMb())) {
                String before = user.getStorageQuotaMb() == null ? "default" : user.getStorageQuotaMb() + " MB";
                user.setStorageQuotaMb(quota);
                audit.record(me, Action.USER_QUOTA_CHANGED, Target.user(user),
                        before + " → " + (quota == null ? "default" : quota + " MB"));
            }
        }
        return views.user(userRepository.save(user), me);
    }

    @DeleteMapping("/users/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void delete(@PathVariable UUID id, Authentication auth) {
        AppUser me = users.current(auth);
        AppUser user = userRepository.findById(id).orElseThrow(ApiException::notFound);
        if (users.isBot(user)) {
            throw ApiException.forbidden("bot_account");
        }
        if (users.isEnvAdmin(user) || user.getId().equals(me.getId())) {
            throw ApiException.forbidden("protected_account");
        }
        audit.record(me, Action.USER_DELETED, Target.user(user), user.getDisplayName());
        users.delete(user);
    }

    @PostMapping("/users/{id}/sessions/end")
    @Transactional
    public Map<String, Integer> endSessions(@PathVariable UUID id, Authentication auth) {
        AppUser me = users.current(auth);
        AppUser user = userRepository.findById(id).orElseThrow(ApiException::notFound);
        if (users.isBot(user)) {
            throw ApiException.forbidden("bot_account");
        }
        int ended = users.endSessions(user.getEmail());
        audit.record(me, Action.USER_SESSIONS_ENDED, Target.user(user), String.valueOf(ended));
        return Map.of("ended", ended);
    }

    /** A new invitation or recovery link for the account (the previous active one is revoked). */
    @PostMapping("/users/{id}/links")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public LinkDto createLink(@PathVariable UUID id, @Valid @RequestBody CreateLink body, Authentication auth) {
        AppUser me = users.current(auth);
        AppUser user = userRepository.findById(id).orElseThrow(ApiException::notFound);
        // the bot never signs in
        if (users.isBot(user)) {
            throw ApiException.forbidden("bot_account");
        }
        if (user.getStatus() != AppUser.Status.ACTIVE) {
            throw ApiException.conflict("account_suspended");
        }
        AccountLinkService.Issued issued = linkService.issue(user, body.kind(), me.getId());
        audit.record(me, Action.LINK_CREATED, Target.user(user), body.kind().name());
        return views.link(issued.link(), user, me.getEmail(), issued.url());
    }

    @GetMapping("/links")
    @Transactional(readOnly = true)
    public List<LinkDto> links() {
        Map<UUID, AppUser> byId = views.usersById();
        return links.findTop100ByOrderByCreatedAtDesc().stream()
                .map(l -> views.link(l, byId.get(l.getUserId()),
                        l.getCreatedBy() == null || !byId.containsKey(l.getCreatedBy()) ? null : byId.get(l.getCreatedBy()).getEmail(),
                        null))
                .toList();
    }

    @DeleteMapping("/links/{id}")
    @Transactional
    public LinkDto revoke(@PathVariable UUID id, Authentication auth) {
        AppUser me = users.current(auth);
        AccountLink link = linkService.revoke(id, me.getId());
        AppUser owner = userRepository.findById(link.getUserId()).orElse(null);
        audit.record(me, Action.LINK_REVOKED, owner == null ? null : Target.user(owner), link.getKind().name());
        return views.link(link, owner, null, null);
    }
}
