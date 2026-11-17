package fr.mbonnici.mybody365.me;

import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.friends.FriendService;
import fr.mbonnici.mybody365.user.AccountDto;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.AvatarService;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** The signed-in account: profile, the two onboarding confirmations, sign-in methods, deletion. */
@RestController
@RequestMapping("/api/me")
public class MeController {

    public record UpdateProfile(@Size(min = 1, max = 40) String displayName, @Pattern(regexp = "fr|en") String locale, Boolean discoverable,
            /** glasses of water a day, 0 to turn the tracker off */
            @jakarta.validation.constraints.Min(0) @jakarta.validation.constraints.Max(30) Integer waterGoal,
            /** the streak's look (1.8): one of the app's icons and colours */
            @Pattern(regexp = STREAK_ICONS) String streakIcon,
            @Pattern(regexp = STREAK_COLORS) String streakColor) {}

    /** the choices of the streak's look, as in the app (core/engage/streak-style.ts) */
    static final String STREAK_ICONS = "flame|muscle|bolt|star|trophy|heart|rocket|diamond|sprout|medal|crown|sun|runner|apple";
    static final String STREAK_COLORS = "orange|red|pink|violet|blue|cyan|green|gold";

    public record Consent(@AssertTrue boolean adult, @AssertTrue boolean health) {}

    public record Passkey(String id, String label, Instant createdAt, Instant lastUsedAt, boolean synced) {}

    public record Security(boolean googleLinked, String googleEmail, List<Passkey> passkeys) {}

    public record DeleteAccount(@NotBlank String confirmEmail) {}

    public record UsernameInput(@NotBlank @Size(max = 24) String username) {}

    /** names that could pass for the app or its team */
    private static final Set<String> RESERVED = Set.of("admin", "administrateur", "mybody365", "mybody", "support", "moderation",
            "moderateur", "staff", "team", "equipe", "root", "system", "null", "undefined");

    private final UserService users;
    private final TrackingService tracking;
    private final JdbcTemplate jdbc;
    private final AvatarService avatars;

    public MeController(UserService users, JdbcTemplate jdbc, TrackingService tracking, AvatarService avatars) {
        this.avatars = avatars;
        this.users = users;
        this.tracking = tracking;
        this.jdbc = jdbc;
    }

    @GetMapping
    public AccountDto me(Authentication auth) {
        AppUser user = users.current(auth);
        return AccountDto.of(user, users.isAdmin(user), tracking.hasProfile(user.getId()));
    }

    @PatchMapping
    @Transactional
    public AccountDto update(@Valid @RequestBody UpdateProfile body, Authentication auth) {
        AppUser user = users.current(auth);
        if (body.displayName() != null) {
            String name = body.displayName().strip();
            if (name.isEmpty()) {
                throw ApiException.badRequest("validation_failed");
            }
            user.setDisplayName(name);
        }
        if (body.locale() != null) {
            user.setLocale(body.locale());
        }
        if (body.discoverable() != null) {
            user.setDiscoverable(body.discoverable());
        }
        if (body.waterGoal() != null) {
            user.setWaterGoal(body.waterGoal() == 0 ? null : body.waterGoal());
        }
        if (body.streakIcon() != null) {
            user.setStreakIcon(body.streakIcon());
        }
        if (body.streakColor() != null) {
            user.setStreakColor(body.streakColor());
        }
        return AccountDto.of(users.save(user), users.isAdmin(user), tracking.hasProfile(user.getId()));
    }

    /** the username friends can find me by: lowercase letters, digits, "." and "_", 3 to 20 characters, unique */
    @PutMapping("/username")
    @Transactional
    public AccountDto username(@Valid @RequestBody UsernameInput body, Authentication auth) {
        AppUser user = users.current(auth);
        String u = FriendService.normalize(body.username());
        if (u == null || u.startsWith(".") || u.endsWith(".") || u.contains("..")) {
            throw ApiException.badRequest("username_invalid");
        }
        if (RESERVED.contains(u.replace(".", "").replace("_", ""))) {
            throw ApiException.conflict("username_taken");
        }
        if (!u.equals(user.getUsername())) {
            boolean taken = !jdbc.queryForList("select 1 from app_user where username = ? and id <> ?", Integer.class, u, user.getId())
                    .isEmpty();
            if (taken) {
                throw ApiException.conflict("username_taken");
            }
            jdbc.update("update app_user set username = ? where id = ?", u, user.getId());
        }
        return AccountDto.of(user, users.isAdmin(user), tracking.hasProfile(user.getId())).withUsername(u);
    }

    /** a picture of one's own (square, re-encoded without metadata); the old one is deleted */
    @PostMapping(value = "/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional
    public AccountDto avatar(@RequestParam("file") MultipartFile file, Authentication auth) throws IOException {
        AppUser user = avatars.set(users.current(auth), file.getBytes());
        return AccountDto.of(user, users.isAdmin(user), tracking.hasProfile(user.getId()));
    }

    /** back to the initial */
    @DeleteMapping("/avatar")
    @Transactional
    public AccountDto removeAvatar(Authentication auth) {
        AppUser user = avatars.remove(users.current(auth));
        return AccountDto.of(user, users.isAdmin(user), tracking.hasProfile(user.getId()));
    }

    /** "I am 18 or older" and the explicit consent to the processing of health data (GDPR art. 9). */
    @PostMapping("/consent")
    @Transactional
    public AccountDto consent(@Valid @RequestBody Consent body, Authentication auth) {
        AppUser user = users.current(auth);
        Instant now = Instant.now();
        if (user.getAdultConfirmedAt() == null) {
            user.setAdultConfirmedAt(now);
        }
        if (user.getHealthConsentAt() == null) {
            user.setHealthConsentAt(now);
        }
        return AccountDto.of(users.save(user), users.isAdmin(user), tracking.hasProfile(user.getId()));
    }

    @GetMapping("/security")
    public Security security(Authentication auth) {
        AppUser user = users.current(auth);
        List<Passkey> passkeys = jdbc.query("""
                select c.credential_id, c.label, c.created, c.last_used, c.backup_eligible
                from user_credentials c join user_entities e on e.id = c.user_entity_user_id
                where e.name = ? order by c.created""",
                (rs, i) -> new Passkey(rs.getString(1), rs.getString(2), instant(rs.getTimestamp(3)), instant(rs.getTimestamp(4)),
                        rs.getBoolean(5)),
                user.getEmail());
        return new Security(user.getGoogleSub() != null, user.getGoogleEmail(), passkeys);
    }

    @DeleteMapping("/passkeys/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePasskey(@PathVariable String id, Authentication auth) {
        AppUser user = users.current(auth);
        int deleted = jdbc.update("""
                delete from user_credentials where credential_id = ?
                and user_entity_user_id in (select id from user_entities where name = ?)""", id, user.getEmail());
        if (deleted == 0) {
            throw ApiException.notFound();
        }
    }

    /** Deletes the account and all its data. The address must be typed again, as a confirmation. */
    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void deleteAccount(@Valid @RequestBody DeleteAccount body, Authentication auth, HttpServletRequest request) {
        AppUser user = users.current(auth);
        if (!user.getEmail().equalsIgnoreCase(body.confirmEmail().strip())) {
            throw ApiException.badRequest("confirmation_mismatch");
        }
        if (users.isEnvAdmin(user)) {
            throw ApiException.forbidden("protected_account");
        }
        users.delete(user);
        SecurityContextHolder.clearContext();
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
