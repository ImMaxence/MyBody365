package fr.mbonnici.mybody365.auth;

import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;

/**
 * Every way in (Google, passkey, invitation or recovery link, local shortcut) ends here: the session
 * holds a plain token whose name is the account e-mail and whose authorities come from the database.
 */
@Component
public class AuthSessions {

    private final UserService users;
    private final SecurityContextRepository contexts = new HttpSessionSecurityContextRepository();

    public AuthSessions(UserService users) {
        this.users = users;
    }

    public Authentication tokenFor(AppUser user) {
        return UsernamePasswordAuthenticationToken.authenticated(user.getEmail(), null, users.authorities(user));
    }

    /** Opens a session for the account, with a fresh session id (no fixation). */
    public void signIn(AppUser user, AppUser.LoginMethod method, HttpServletRequest request, HttpServletResponse response) {
        if (request.getSession(false) != null) {
            request.changeSessionId();
        } else {
            request.getSession(true);
        }
        store(tokenFor(user), request, response);
        user.recordLogin(method);
        users.save(user);
    }

    /** Replaces the authentication of the current session (role change, other login token types). */
    public void store(Authentication authentication, HttpServletRequest request, HttpServletResponse response) {
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
    }
}
