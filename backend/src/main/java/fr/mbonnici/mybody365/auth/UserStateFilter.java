package fr.mbonnici.mybody365.auth;

import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Re-checks the account behind every authenticated request: a suspended or deleted account loses its
 * session at once, a role change applies without signing in again, and the heavier login tokens
 * (Google, passkey) are swapped for the plain session token of {@link AuthSessions}.
 * Created by SecurityConfig and registered inside the security chain only: not a bean, so it is
 * never added as a plain servlet filter as well.
 */
public class UserStateFilter extends OncePerRequestFilter {

    private final UserService users;
    private final AuthSessions sessions;

    public UserStateFilter(UserService users, AuthSessions sessions) {
        this.users = users;
        this.sessions = sessions;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            chain.doFilter(request, response);
            return;
        }
        Optional<AppUser> user = users.findByEmail(auth.getName()).filter(u -> u.getStatus() == AppUser.Status.ACTIVE);
        if (user.isEmpty()) {
            SecurityContextHolder.clearContext();
            HttpSession session = request.getSession(false);
            if (session != null) {
                session.invalidate();
            }
            chain.doFilter(request, response);
            return;
        }
        Authentication fresh = sessions.tokenFor(user.get());
        if (!(auth instanceof UsernamePasswordAuthenticationToken) || !names(auth).equals(names(fresh))) {
            sessions.store(fresh, request, response);
        }
        chain.doFilter(request, response);
    }

    private static Set<String> names(Authentication a) {
        return a.getAuthorities().stream().map(GrantedAuthority::getAuthority).collect(Collectors.toCollection(HashSet::new));
    }
}
