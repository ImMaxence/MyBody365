package fr.mbonnici.mybody365.config;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;

/**
 * The session cookie, set explicitly (Spring Session does not read server.servlet.session.cookie.*):
 * HttpOnly, SameSite=Lax, Secure in production, and persistent for 90 days because an installed app
 * (iOS especially) drops session-only cookies when it is closed. The session itself expires after
 * 30 days without use (spring.session.timeout).
 */
@Configuration
public class SessionConfig {

    public static final String COOKIE = SecurityConfig.SESSION_COOKIE;

    @Bean
    CookieSerializer cookieSerializer(@Value("${app.cookie-secure:false}") boolean secure) {
        DefaultCookieSerializer serializer = new DefaultCookieSerializer();
        serializer.setCookieName(COOKIE);
        serializer.setCookiePath("/");
        serializer.setUseHttpOnlyCookie(true);
        serializer.setSameSite("Lax");
        serializer.setUseSecureCookie(secure);
        serializer.setCookieMaxAge((int) Duration.ofDays(90).toSeconds());
        return serializer;
    }
}
