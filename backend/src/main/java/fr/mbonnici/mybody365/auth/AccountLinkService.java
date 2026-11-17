package fr.mbonnici.mybody365.auth;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.config.AppProperties;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.AppUserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Invitation and recovery links: 256 random bits, shown once, stored as a SHA-256, single use,
 * valid {@code app.recovery-link-hours} (24 h), revocable by any admin until used. A new link for
 * an account revokes the previous active ones.
 */
@Service
public class AccountLinkService {

    private static final SecureRandom RANDOM = new SecureRandom();

    public record Issued(AccountLink link, String url) {}

    private final AccountLinkRepository links;
    private final AppUserRepository users;
    private final AppProperties props;

    public AccountLinkService(AccountLinkRepository links, AppUserRepository users, AppProperties props) {
        this.links = links;
        this.users = users;
        this.props = props;
    }

    @Transactional
    public Issued issue(AppUser user, AccountLink.Kind kind, UUID createdBy) {
        // the account that publishes the community's first recipes: no one signs in with it, whatever the request says
        if (fr.mbonnici.mybody365.recipe.CommunityRecipes.TEAM_EMAIL.equalsIgnoreCase(user.getEmail())) {
            throw ApiException.conflict("team_account");
        }
        Instant now = Instant.now();
        links.findByUserIdOrderByCreatedAtDesc(user.getId()).stream()
                .filter(l -> l.state(now) == AccountLink.State.ACTIVE)
                .forEach(l -> l.revoke(createdBy));
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        AccountLink link = links.save(new AccountLink(user.getId(), kind, hash(token), createdBy,
                now.plus(Duration.ofHours(props.recoveryLinkHours()))));
        // the token travels in the fragment: never sent to a server, never in a log or a Referer
        return new Issued(link, props.url() + "/link#" + token);
    }

    /** Consumes a token: the account it belongs to, or 410 when unknown, used, revoked or expired. */
    @Transactional
    public Redeemed redeem(String token) {
        AccountLink link = links.findByTokenHash(hash(token == null ? "" : token.trim()))
                .orElseThrow(() -> new ApiException(HttpStatus.GONE, "link_invalid"));
        AccountLink.State state = link.state(Instant.now());
        if (state != AccountLink.State.ACTIVE) {
            throw new ApiException(HttpStatus.GONE, "link_" + state.name().toLowerCase());
        }
        AppUser user = users.findById(link.getUserId()).orElseThrow(() -> new ApiException(HttpStatus.GONE, "link_invalid"));
        if (user.getStatus() != AppUser.Status.ACTIVE) {
            throw new ApiException(HttpStatus.GONE, "link_invalid");
        }
        link.markUsed();
        return new Redeemed(user, link.getKind());
    }

    public record Redeemed(AppUser user, AccountLink.Kind kind) {}

    @Transactional
    public AccountLink revoke(UUID linkId, UUID by) {
        AccountLink link = links.findById(linkId).orElseThrow(ApiException::notFound);
        if (link.state(Instant.now()) == AccountLink.State.ACTIVE) {
            link.revoke(by);
        }
        return link;
    }

    static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
