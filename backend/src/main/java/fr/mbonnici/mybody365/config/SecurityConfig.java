package fr.mbonnici.mybody365.config;

import fr.mbonnici.mybody365.auth.AppOidcUserService;
import fr.mbonnici.mybody365.auth.AppOidcUserService.AppOidcUser;
import fr.mbonnici.mybody365.auth.AuthSessions;
import fr.mbonnici.mybody365.auth.UserStateFilter;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.ObjectPostProcessor;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.security.web.webauthn.authentication.WebAuthnAuthenticationFilter;
import org.springframework.security.web.webauthn.management.JdbcPublicKeyCredentialUserEntityRepository;
import org.springframework.security.web.webauthn.management.JdbcUserCredentialRepository;
import org.springframework.security.web.webauthn.management.PublicKeyCredentialUserEntityRepository;
import org.springframework.security.web.webauthn.management.UserCredentialRepository;

/**
 * One filter chain for the whole API:
 * <ul>
 * <li>Google sign-in under /api/auth/oauth2/** (only known accounts, see AppOidcUserService);</li>
 * <li>passkeys with Spring Security's endpoints: POST /webauthn/register/options, /webauthn/register,
 * /webauthn/authenticate/options and /login/webauthn (proxied by the frontend like /api);</li>
 * <li>CSRF tokens in the XSRF-TOKEN cookie, echoed by Angular in X-XSRF-TOKEN;</li>
 * <li>sessions in PostgreSQL (Spring Session JDBC), re-checked on every request by UserStateFilter.</li>
 * </ul>
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    public static final String SESSION_COOKIE = "MBSESSION";
    public static final String CSRF_COOKIE = "XSRF-TOKEN";

    /** Errors Google sign-in may end with; anything else is reported as "not_allowed". */
    private static final Set<String> GOOGLE_ERRORS = Set.of("not_allowed", "suspended", "google_already_linked");

    @Bean
    PublicKeyCredentialUserEntityRepository passkeyUsers(JdbcOperations jdbc) {
        return new JdbcPublicKeyCredentialUserEntityRepository(jdbc);
    }

    @Bean
    UserCredentialRepository passkeyCredentials(JdbcOperations jdbc) {
        return new JdbcUserCredentialRepository(jdbc);
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, AppOidcUserService oidcUserService, AppProperties props,
            AuthSessions sessions, UserService users) throws Exception {

        AuthenticationSuccessHandler googleSuccess = (request, response, authentication) -> {
            boolean linked = authentication.getPrincipal() instanceof AppOidcUser u && u.linked();
            users.findByEmail(authentication.getName())
                    .ifPresent(user -> sessions.signIn(user, AppUser.LoginMethod.GOOGLE, request, response));
            // a link is often made from a browser tab (recovery link opened in Safari): /link works outside the app
            response.sendRedirect(props.url() + (linked ? "/link?linked=google" : "/app"));
        };
        AuthenticationFailureHandler googleFailure = (request, response, exception) -> {
            String code = exception instanceof OAuth2AuthenticationException e ? e.getError().getErrorCode() : "not_allowed";
            response.sendRedirect(props.url() + "/app/login?error=" + (GOOGLE_ERRORS.contains(code) ? code : "not_allowed"));
        };
        AuthenticationSuccessHandler passkeySuccess = (request, response, authentication) -> {
            users.findByEmail(authentication.getName())
                    .ifPresent(user -> sessions.signIn(user, AppUser.LoginMethod.PASSKEY, request, response));
            json(response, HttpStatus.OK, "{\"authenticated\":true,\"redirectUrl\":\"/app\"}");
        };

        var csrfRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrfRepository.setCookieName(CSRF_COOKIE);
        csrfRepository.setCookieCustomizer(cookie -> cookie.sameSite("Lax").secure(props.url().startsWith("https://")));

        http
                .csrf(csrf -> csrf
                        .csrfTokenRepository(csrfRepository)
                        .csrfTokenRequestHandler(new SpaCsrfTokenRequestHandler()))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/actuator/health", "/api/actuator/health/**").permitAll()
                        .requestMatchers("/api/actuator/**").hasRole("ADMIN")
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .requestMatchers("/api/auth/**", "/api/access-requests", "/api/errors").permitAll()
                        .requestMatchers("/webauthn/authenticate/options", "/login/webauthn").permitAll()
                        .requestMatchers("/webauthn/register/**", "/webauthn/register").hasRole("USER")
                        .requestMatchers("/api/**").hasRole("USER")
                        // the backend serves nothing else (the frontend container serves the app)
                        .anyRequest().denyAll())
                .oauth2Login(oauth -> oauth
                        .loginPage("/app/login")
                        .authorizationEndpoint(a -> a.baseUri("/api/auth/oauth2/authorization"))
                        .redirectionEndpoint(r -> r.baseUri("/api/auth/oauth2/code/*"))
                        .userInfoEndpoint(u -> u.oidcUserService(oidcUserService))
                        // Google tokens are not needed after sign-in: nothing is kept
                        .authorizedClientRepository(new DiscardingAuthorizedClientRepository())
                        .successHandler(googleSuccess)
                        .failureHandler(googleFailure))
                .webAuthn(webAuthn -> webAuthn
                        .rpName("MyBody365")
                        .rpId(props.rpId())
                        .allowedOrigins(props.origin())
                        .disableDefaultRegistrationPage(true)
                        .withObjectPostProcessor(new ObjectPostProcessor<WebAuthnAuthenticationFilter>() {
                            @Override
                            public <O extends WebAuthnAuthenticationFilter> O postProcess(O filter) {
                                filter.setAuthenticationSuccessHandler(passkeySuccess);
                                return filter;
                            }
                        }))
                .logout(logout -> logout
                        .logoutUrl("/api/auth/logout")
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT))
                        .invalidateHttpSession(true)
                        .deleteCookies(SESSION_COOKIE))
                // an API only: no redirect to a login page, a plain 401
                .exceptionHandling(ex -> ex.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .addFilterBefore(new UserStateFilter(users, sessions), AuthorizationFilter.class)
                .headers(headers -> headers
                        .contentTypeOptions(Customizer.withDefaults())
                        .frameOptions(frame -> frame.deny())
                        .referrerPolicy(r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                        .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31_536_000)));

        return http.build();
    }

    private static void json(HttpServletResponse response, HttpStatus status, String body) throws java.io.IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(body);
    }

    /** Sign-in only: the Google access token is never stored, on the server or in the session. */
    static final class DiscardingAuthorizedClientRepository implements OAuth2AuthorizedClientRepository {
        @Override
        public <T extends OAuth2AuthorizedClient> T loadAuthorizedClient(String clientRegistrationId, Authentication principal,
                HttpServletRequest request) {
            return null;
        }

        @Override
        public void saveAuthorizedClient(OAuth2AuthorizedClient authorizedClient, Authentication principal,
                HttpServletRequest request, HttpServletResponse response) {
            // nothing kept
        }

        @Override
        public void removeAuthorizedClient(String clientRegistrationId, Authentication principal, HttpServletRequest request,
                HttpServletResponse response) {
            // nothing kept
        }
    }
}
