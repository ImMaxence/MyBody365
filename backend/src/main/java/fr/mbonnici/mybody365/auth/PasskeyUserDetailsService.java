package fr.mbonnici.mybody365.auth;

import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.UserService;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

/**
 * Called by Spring Security once a passkey signature has been verified: the passkey's user name is
 * the account e-mail. Suspended or deleted accounts are refused even with a valid passkey.
 */
@Service
public class PasskeyUserDetailsService implements UserDetailsService {

    private final UserService users;

    public PasskeyUserDetailsService(UserService users) {
        this.users = users;
    }

    @Override
    public UserDetails loadUserByUsername(String username) {
        AppUser user = users.findByEmail(username).orElseThrow(() -> new UsernameNotFoundException("unknown account"));
        if (user.getStatus() != AppUser.Status.ACTIVE) {
            throw new DisabledException("suspended");
        }
        // there is no password: the value can never match anything
        return User.withUsername(user.getEmail()).password("{noop}" + java.util.UUID.randomUUID())
                .authorities(users.authorities(user)).build();
    }
}
