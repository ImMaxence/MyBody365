package fr.mbonnici.mybody365.admin;

import fr.mbonnici.mybody365.admin.AdminDtos.GoogleDto;
import fr.mbonnici.mybody365.admin.AdminDtos.LinkDto;
import fr.mbonnici.mybody365.admin.AdminDtos.UserDto;
import fr.mbonnici.mybody365.auth.AccountLink;
import fr.mbonnici.mybody365.auth.AccountLinkRepository;
import fr.mbonnici.mybody365.config.AppProperties;
import fr.mbonnici.mybody365.storage.QuotaService;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.AppUserRepository;
import fr.mbonnici.mybody365.user.UserService;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** Builds the admin views of accounts and links. */
@Component
class AdminViews {

    private final UserService users;
    private final AppUserRepository userRepository;
    private final AccountLinkRepository links;
    private final QuotaService quota;
    private final AppProperties props;

    AdminViews(UserService users, AppUserRepository userRepository, AccountLinkRepository links, QuotaService quota,
            AppProperties props) {
        this.quota = quota;
        this.props = props;
        this.users = users;
        this.userRepository = userRepository;
        this.links = links;
    }

    UserDto user(AppUser u, AppUser viewer) {
        Instant now = Instant.now();
        LinkDto active = links.findByUserIdOrderByCreatedAtDesc(u.getId()).stream()
                .filter(l -> l.state(now) == AccountLink.State.ACTIVE)
                .findFirst()
                .map(l -> link(l, u, null, null))
                .orElse(null);
        return new UserDto(u.getId(), u.getEmail(), u.getDisplayName(), u.getAvatarUrl(),
                users.isAdmin(u) ? "ADMIN" : "USER", u.getStatus().name(), users.isEnvAdmin(u),
                viewer != null && viewer.getId().equals(u.getId()),
                new GoogleDto(u.getGoogleSub() != null, u.getGoogleEmail()), users.passkeyCount(u), u.isOnboarded(),
                u.getCreatedAt(), u.getLastLoginAt(), u.getLastLoginMethod() == null ? null : u.getLastLoginMethod().name(), active,
                quota.usedBytes(u.getId()), u.getStorageQuotaMb(), props.storage().quotaMb());
    }

    LinkDto link(AccountLink l, AppUser owner, String createdBy, String url) {
        return new LinkDto(l.getId(), l.getKind().name(), l.state(Instant.now()).name(), l.getUserId(),
                owner == null ? null : owner.getEmail(), owner == null ? null : owner.getDisplayName(), createdBy,
                l.getCreatedAt(), l.getExpiresAt(), l.getUsedAt(), l.getRevokedAt(), url);
    }

    Map<UUID, AppUser> usersById() {
        return userRepository.findAll().stream().collect(Collectors.toMap(AppUser::getId, Function.identity()));
    }
}
