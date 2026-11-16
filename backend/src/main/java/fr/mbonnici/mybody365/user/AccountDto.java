package fr.mbonnici.mybody365.user;

import java.util.UUID;

/** The signed-in account as the app sees it. */
public record AccountDto(
        UUID id,
        String email,
        String displayName,
        String avatarUrl,
        String role,
        String locale,
        boolean onboarded,
        /** the body profile (height, weight, goal) has been filled in */
        boolean profileComplete,
        boolean admin) {

    public static AccountDto of(AppUser user, boolean admin, boolean profileComplete) {
        return new AccountDto(user.getId(), user.getEmail(), user.getDisplayName(), user.getAvatarUrl(),
                admin ? "ADMIN" : "USER", user.getLocale(), user.isOnboarded(), profileComplete, admin);
    }
}
