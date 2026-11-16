package fr.mbonnici.mybody365.auth;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.config.AppProperties;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.AppUserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * <b>Local-only</b> sign-in without Google, for development and the end-to-end tests. It needs
 * {@code DEV_LOGIN=true} <em>and</em> an {@code APP_URL} on localhost, so a production deployment
 * can never expose it by accident. {@code as=admin} signs in as the first ADMIN_EMAILS address,
 * {@code as=user} as a regular demo account, {@code as=new} as a new account each time.
 */
@RestController
@RequestMapping("/api/auth")
public class DevLoginController {

    static final String DEMO_USER = "demo@localhost";
    private static final Logger log = LoggerFactory.getLogger(DevLoginController.class);

    private final AppProperties props;
    private final AppUserRepository users;
    private final AuthSessions sessions;

    public DevLoginController(AppProperties props, AppUserRepository users, AuthSessions sessions) {
        this.props = props;
        this.users = users;
        this.sessions = sessions;
    }

    static boolean allowed(AppProperties props) {
        try {
            return props.devLogin() && props.isLocal();
        } catch (RuntimeException e) {
            return false;
        }
    }

    @GetMapping("/dev-login")
    @Transactional
    public void devLogin(@RequestParam(defaultValue = "admin") String as, HttpServletRequest request,
            HttpServletResponse response) throws IOException {
        if (!allowed(props)) {
            throw ApiException.notFound();
        }
        boolean admin = !"user".equals(as) && !"new".equals(as);
        // "new": a brand-new account each time, to go through the whole onboarding (end-to-end tests)
        String email = admin ? props.adminEmails().getFirst()
                : "new".equals(as) ? "demo+" + java.util.UUID.randomUUID().toString().substring(0, 8) + "@localhost" : DEMO_USER;
        AppUser user = users.findByEmail(email).orElseGet(() ->
                users.save(AppUser.create(email, admin ? "Admin" : "Léa", admin ? AppUser.Role.ADMIN : AppUser.Role.USER)));
        sessions.signIn(user, AppUser.LoginMethod.DEV, request, response);
        log.warn("DEV LOGIN used: local session opened for {}", email);
        response.sendRedirect(props.url() + "/app");
    }
}
