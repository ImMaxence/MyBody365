package fr.mbonnici.mybody365.user;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.common.Emails;
import fr.mbonnici.mybody365.config.AppProperties;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Accounts: who is an admin, the authorities of a session, and what goes when an account goes. */
@Service
public class UserService {

    public static final String ROLE_USER = "ROLE_USER";
    public static final String ROLE_ADMIN = "ROLE_ADMIN";

    private final AppUserRepository users;
    private final AppProperties props;
    private final JdbcTemplate jdbc;
    private final FindByIndexNameSessionRepository<? extends Session> sessions;
    private final ApplicationEventPublisher events;

    public UserService(AppUserRepository users, AppProperties props, JdbcTemplate jdbc,
            FindByIndexNameSessionRepository<? extends Session> sessions, ApplicationEventPublisher events) {
        this.users = users;
        this.props = props;
        this.jdbc = jdbc;
        this.sessions = sessions;
        this.events = events;
    }

    public Optional<AppUser> findByEmail(String email) {
        return email == null ? Optional.empty() : users.findByEmail(Emails.normalize(email));
    }

    /** The account behind an authenticated request (the principal name is the account e-mail). */
    public AppUser current(Authentication authentication) {
        if (authentication == null) {
            throw new ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED, "unauthenticated");
        }
        return findByEmail(authentication.getName())
                .orElseThrow(() -> new ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED, "unauthenticated"));
    }

    /** Addresses listed in ADMIN_EMAILS are admins whatever the database says, and cannot be demoted. */
    public boolean isEnvAdmin(AppUser user) {
        return props.isAdminEmail(user.getEmail());
    }

    public boolean isAdmin(AppUser user) {
        return user.getRole() == AppUser.Role.ADMIN || isEnvAdmin(user);
    }

    /** 1.14: the team account (the community's recipes) */
    public boolean isBot(AppUser user) {
        return user.getRole() == AppUser.Role.BOT;
    }

    public List<GrantedAuthority> authorities(AppUser user) {
        List<GrantedAuthority> list = new ArrayList<>(2);
        list.add(new SimpleGrantedAuthority(ROLE_USER));
        if (isAdmin(user)) {
            list.add(new SimpleGrantedAuthority(ROLE_ADMIN));
        }
        return List.copyOf(list);
    }

    @Transactional
    public AppUser save(AppUser user) {
        return users.save(user);
    }

    /** Ends every open session of the account (suspension, deletion, e-mail change). */
    public int endSessions(String email) {
        var found = sessions.findByPrincipalName(email);
        found.keySet().forEach(sessions::deleteById);
        return found.size();
    }

    /** Number of passkeys registered by the account. */
    public int passkeyCount(AppUser user) {
        Integer n = jdbc.queryForObject("""
                select count(*) from user_credentials c join user_entities e on e.id = c.user_entity_user_id
                where e.name = ?""", Integer.class, user.getEmail());
        return n == null ? 0 : n;
    }

    /** The passkey "user name" follows the account e-mail, so existing passkeys keep working after a change. */
    @Transactional
    public void changeEmail(AppUser user, String newEmail) {
        String email = Emails.normalize(newEmail);
        if (email.equals(user.getEmail())) {
            return;
        }
        if (users.existsByEmail(email)) {
            throw ApiException.conflict("email_taken");
        }
        String old = user.getEmail();
        jdbc.update("update user_entities set name = ?, display_name = ? where name = ?", email, email, old);
        user.setEmail(email);
        users.save(user);
        endSessions(old);
    }

    /** Deletes the account and everything attached to it (passkeys, sessions, links, data, pictures). */
    @Transactional
    public void delete(AppUser user) {
        jdbc.update("delete from user_credentials where user_entity_user_id in (select id from user_entities where name = ?)",
                user.getEmail());
        jdbc.update("delete from user_entities where name = ?", user.getEmail());
        users.delete(user);
        endSessions(user.getEmail());
        events.publishEvent(new AccountDeletedEvent(user.getId()));
    }
}
