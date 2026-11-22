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
        /** shown in the username suggestions */
        boolean discoverable,
        /** glasses of water a day; null: the water tracker is off */
        Integer waterGoal,
        String role,
        /** the language chosen in the app; null until one is (the app then follows the device) */
        String locale,
        boolean onboarded,
        /** the body profile (height, weight, goal) has been filled in */
        boolean profileComplete,
        boolean admin,
        /** the streak's icon and colour (1.8): « flame » and « orange » unless chosen */
        String streakIcon,
        String streakColor,
        /** 1.17: the optional modules turned on: the blood pressure, the pill box */
        boolean bpEnabled,
        boolean pillsEnabled) {

    public AccountDto withUsername(String u) {
        return new AccountDto(id, email, displayName, u, avatarUrl, ownAvatar, discoverable, waterGoal, role, locale, onboarded, profileComplete, admin,
                streakIcon, streakColor, bpEnabled, pillsEnabled);
    }

    public static AccountDto of(AppUser user, boolean admin, boolean profileComplete) {
        return new AccountDto(user.getId(), user.getEmail(), user.getDisplayName(), user.getUsername(), user.getPictureUrl(),
                user.getAvatarVersion() != null, user.isDiscoverable(), user.getWaterGoal(),
                admin ? "ADMIN" : "USER", user.isLocaleChosen() ? user.getLocale() : null, user.isOnboarded(), profileComplete, admin, user.getStreakIcon(), user.getStreakColor(),
                user.isBpEnabled(), user.isPillsEnabled());
    }
}
