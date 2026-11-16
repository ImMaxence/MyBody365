package fr.mbonnici.mybody365;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;

import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.AppUserRepository;
import fr.mbonnici.mybody365.user.UserService;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** Full application context on a throw-away PostgreSQL container, shared across test classes. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
public abstract class AbstractIntegrationTest {

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected AppUserRepository userRepository;

    @Autowired
    protected UserService users;

    @Autowired
    protected JdbcTemplate jdbc;

    protected void wipe() {
        jdbc.update("delete from body_log");
        jdbc.update("delete from body_profile");
        jdbc.update("delete from admin_audit");
        jdbc.update("delete from account_link");
        jdbc.update("delete from access_request");
        jdbc.update("delete from user_credentials");
        jdbc.update("delete from user_entities");
        jdbc.update("delete from spring_session");
        jdbc.update("delete from app_user");
    }

    protected AppUser account(String email, AppUser.Role role) {
        return userRepository.findByEmail(email).orElseGet(() -> {
            AppUser u = AppUser.create(email, null, role);
            u.setAdultConfirmedAt(Instant.now());
            u.setHealthConsentAt(Instant.now());
            return userRepository.save(u);
        });
    }

    /** Signs the request in as the account, with the authorities the database gives it. */
    protected RequestPostProcessor as(AppUser user) {
        return authentication(UsernamePasswordAuthenticationToken.authenticated(user.getEmail(), null, users.authorities(user)));
    }
}
