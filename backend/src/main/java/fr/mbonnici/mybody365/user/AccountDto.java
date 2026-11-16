package fr.mbonnici.mybody365.user;

import java.util.UUID;

/** The signed-in account as the app sees it. */
public record AccountDto(
        UUID id,
        String email,
        String displayName,
        String username,
        /** the picture shown: one's own when uploaded, else the Google one */
        String avatarUrl,
        /** a picture of one's own was uploaded (it can be removed) */
        boolean ownAvatar,
        String role,
        String locale,
        boolean onboarded,
        /** the body profile (height, weight, goal) has been filled in */
        boolean profileComplete,
        boolean admin) {

    public AccountDto withUsername(String u) {
        return new AccountDto(id, email, displayName, u, avatarUrl, ownAvatar, role, locale, onboarded, profileComplete, admin);
    }

    public static AccountDto of(AppUser user, boolean admin, boolean profileComplete) {
        return new AccountDto(user.getId(), user.getEmail(), user.getDisplayName(), user.getUsername(), user.getPictureUrl(),
                user.getAvatarVersion() != null,
                admin ? "ADMIN" : "USER", user.getLocale(), user.isOnboarded(), profileComplete, admin);
    }
}
