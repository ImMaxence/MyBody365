package fr.mbonnici.mybody365.auth;

import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.config.AppProperties;
import fr.mbonnici.mybody365.user.AccountDto;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    public record Me(boolean authenticated, AccountDto account) {
        static final Me ANONYMOUS = new Me(false, null);
    }

    public record Providers(boolean google, boolean passkey, boolean devLogin) {}

    public record RedeemRequest(@NotBlank @Size(max = 100) String token) {}

    public record Redeemed(String kind, AccountDto account) {}

    private final UserService users;
    private final TrackingService tracking;
    private final AccountLinkService links;
    private final AuthSessions sessions;
    private final AppProperties props;
    private final boolean googleConfigured;

    public AuthController(UserService users, AccountLinkService links, AuthSessions sessions, AppProperties props,
            TrackingService tracking,
            @Value("${spring.security.oauth2.client.registration.google.client-id:}") String clientId) {
        this.users = users;
        this.tracking = tracking;
        this.links = links;
        this.sessions = sessions;
        this.props = props;
        this.googleConfigured = clientId != null && !clientId.isBlank() && !"not-configured".equals(clientId);
    }

    /** Always 200: the app calls this on start to choose between the sign-in screen and the app. */
    @GetMapping("/me")
    public Me me(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated() || authentication instanceof AnonymousAuthenticationToken) {
            return Me.ANONYMOUS;
        }
        return users.findByEmail(authentication.getName())
                .map(u -> new Me(true, AccountDto.of(u, users.isAdmin(u), tracking.hasProfile(u.getId()))))
                .orElse(Me.ANONYMOUS);
    }

    @GetMapping("/providers")
    public Providers providers() {
        return new Providers(googleConfigured, true, DevLoginController.allowed(props));
    }

    /** Opens a session from an invitation or recovery link; the app then offers to add a passkey or link Google. */
    @PostMapping("/links/redeem")
    public Redeemed redeem(@Valid @RequestBody RedeemRequest body, HttpServletRequest request, HttpServletResponse response) {
        AccountLinkService.Redeemed redeemed = links.redeem(body.token());
        AppUser user = redeemed.user();
        sessions.signIn(user, AppUser.LoginMethod.LINK, request, response);
        return new Redeemed(redeemed.kind().name(), AccountDto.of(user, users.isAdmin(user), tracking.hasProfile(user.getId())));
    }

    /**
     * Attaches a Google account to the signed-in account: remembers who asked, then starts the usual
     * Google sign-in (see {@link AppOidcUserService#LINK_FOR}).
     */
    @GetMapping("/link/google")
    public void linkGoogle(Authentication authentication, HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        if (authentication == null || authentication instanceof AnonymousAuthenticationToken || !googleConfigured) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "unauthenticated");
        }
        AppUser user = users.current(authentication);
        request.getSession(true).setAttribute(AppOidcUserService.LINK_FOR, user.getEmail());
        response.sendRedirect("/api/auth/oauth2/authorization/google");
    }
}
