package fr.mbonnici.mybody365.auth;

import fr.mbonnici.mybody365.common.Emails;
import fr.mbonnici.mybody365.config.AppProperties;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.AppUserRepository;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.servlet.http.HttpSession;
import java.io.Serial;
import java.util.Collection;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.OidcUserInfo;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Google sign-in. Only known accounts get in: people an admin approved (matched by e-mail on their
 * first sign-in), accounts already linked to this Google account, and the ADMIN_EMAILS addresses
 * (created on the fly). Everyone else is turned away with {@code not_allowed} and can request access.
 * <p>
 * When the session carries {@link #LINK_FOR} (set by "link a Google account" in the app, typically
 * after a recovery link), the Google account is attached to that account instead.
 */
@Service
public class AppOidcUserService extends OidcUserService {

    public static final String LINK_FOR = "mb.linkGoogleFor";

    private static final Logger log = LoggerFactory.getLogger(AppOidcUserService.class);

    private final AppUserRepository users;
    private final UserService userService;
    private final AppProperties props;

    public AppOidcUserService(AppUserRepository users, UserService userService, AppProperties props) {
        this.users = users;
        this.userService = userService;
        this.props = props;
    }

    /** The Google identity, named after the MyBody365 account it signed in to. */
    public static final class AppOidcUser extends DefaultOidcUser {
        @Serial
        private static final long serialVersionUID = 1L;
        private final String accountEmail;
        private final boolean linked;

        AppOidcUser(Collection<? extends GrantedAuthority> authorities, OidcIdToken idToken, OidcUserInfo userInfo,
                String accountEmail, boolean linked) {
            super(authorities, idToken, userInfo);
            this.accountEmail = accountEmail;
            this.linked = linked;
        }

        @Override
        public String getName() {
            return accountEmail;
        }

        public boolean linked() {
            return linked;
        }
    }

    @Override
    @Transactional
    public OidcUser loadUser(OidcUserRequest userRequest) throws OAuth2AuthenticationException {
        OidcUser google = super.loadUser(userRequest);
        String email = Emails.normalize(google.getEmail());
        String sub = google.getSubject();
        if (!StringUtils.hasText(email) || !Boolean.TRUE.equals(google.getEmailVerified()) || !StringUtils.hasText(sub)) {
            throw reject("not_allowed", email);
        }

        // the first sign-in with this Google account (its picture is taken once, see GooglePictureImporter)
        boolean firstTime = users.findByGoogleSub(sub).isEmpty();
        HttpSession session = currentSession();
        String linkFor = session == null ? null : (String) session.getAttribute(LINK_FOR);
        AppUser user;
        boolean linked = false;
        if (linkFor != null) {
            session.removeAttribute(LINK_FOR);
            user = link(linkFor, sub, email);
            linked = true;
        } else {
            user = find(sub, email);
        }

        if (user.getStatus() != AppUser.Status.ACTIVE) {
            throw reject("suspended", email);
        }
        if (firstTime && user.getAvatarVersion() == null && !StringUtils.hasText(user.getAvatarUrl())
                && StringUtils.hasText(google.getPicture())) {
            // shown from Google for a minute, then copied into the app by GooglePictureImporter
            user.setAvatarUrl(google.getPicture());
        }
        if (user.getDisplayName().equals(user.getEmail().substring(0, user.getEmail().indexOf('@')))
                && StringUtils.hasText(google.getGivenName())) {
            user.setDisplayName(google.getGivenName());
        }
        user.recordLogin(AppUser.LoginMethod.GOOGLE);
        users.save(user);
        log.info("Google sign-in: {}{}", user.getEmail(), linked ? " (account linked)" : "");
        return new AppOidcUser(userService.authorities(user), google.getIdToken(), google.getUserInfo(), user.getEmail(), linked);
    }

    private AppUser find(String sub, String email) {
        Optional<AppUser> bySub = users.findByGoogleSub(sub);
        if (bySub.isPresent()) {
            return bySub.get();
        }
        Optional<AppUser> byEmail = users.findByEmail(email);
        if (byEmail.isPresent()) {
            AppUser user = byEmail.get();
            if (user.getGoogleSub() != null) {
                // the address is taken by an account linked to another Google account
                throw reject("not_allowed", email);
            }
            user.setGoogleSub(sub);
            user.setGoogleEmail(email);
            return user;
        }
        if (props.isAdminEmail(email)) {
            AppUser admin = AppUser.create(email, null, AppUser.Role.ADMIN);
            admin.setGoogleSub(sub);
            admin.setGoogleEmail(email);
            log.info("Admin account created from ADMIN_EMAILS: {}", email);
            return admin;
        }
        throw reject("not_allowed", email);
    }

    private AppUser link(String accountEmail, String sub, String email) {
        AppUser user = users.findByEmail(accountEmail).orElseThrow(() -> reject("not_allowed", email));
        users.findByGoogleSub(sub).filter(other -> !other.getId().equals(user.getId())).ifPresent(other -> {
            throw reject("google_already_linked", email);
        });
        user.setGoogleSub(sub);
        user.setGoogleEmail(email);
        return user;
    }

    private static OAuth2AuthenticationException reject(String code, String email) {
        log.warn("Google sign-in refused ({}) for {}", code, email);
        return new OAuth2AuthenticationException(new OAuth2Error(code, code, null));
    }

    private static HttpSession currentSession() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
            return attrs.getRequest().getSession(false);
        }
        return null;
    }
}
