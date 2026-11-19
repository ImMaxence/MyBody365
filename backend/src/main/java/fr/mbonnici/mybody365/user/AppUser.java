package fr.mbonnici.mybody365.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

@Entity
@Table(name = "app_user")
public class AppUser {

    /** BOT (1.14): the team account that publishes the community's recipes: no sign-in, never deleted, suspended or promoted */
    public enum Role { USER, ADMIN, BOT }

    public enum Status { ACTIVE, SUSPENDED }

    public enum LoginMethod { GOOGLE, PASSKEY, LINK, DEV }

    @Id
    private UUID id;

    /** canonical e-mail (lower case); also the security principal name and the passkey user name */
    @Column(nullable = false, unique = true)
    private String email;

    /** Google's stable account id, set on the first Google sign-in */
    private String googleSub;

    /** the address of the linked Google account (may differ from {@link #email} after a relink) */
    private String googleEmail;

    @Column(nullable = false)
    private String displayName;

    private String avatarUrl;

    /** unique, made by the database from the name when the account is created (V8), changed with UsernameService */
    @Generated(event = EventType.INSERT)
    @Column(insertable = false, updatable = false)
    private String username;

    /** a picture of one's own (bucket: u/{id}/avatar_{version}.webp); null: the Google picture */
    private Integer avatarVersion;

    private Long avatarBytes;

    /** shown in the username suggestions of the friends search (an exact username always finds the member) */
    @Column(nullable = false)
    private boolean discoverable = true;

    /** glasses of water a day; null: the water tracker is off */
    private Integer waterGoal;

    /** the streak's icon and colour (1.8); null: the flame, in orange */
    private String streakIcon;

    private String streakColor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role = Role.USER;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.ACTIVE;

    @Column(nullable = false)
    private String locale = "fr";

    /** 1.14: the language was chosen in the app; until then it is the device's (sent by the app) */
    @Column(nullable = false)
    private boolean localeChosen;

    private Instant adultConfirmedAt;
    private Instant healthConsentAt;

    @Column(nullable = false)
    private Instant createdAt;

    private Instant lastLoginAt;

    @Enumerated(EnumType.STRING)
    private LoginMethod lastLoginMethod;

    /** storage allowed in MB; null = the default (STORAGE_QUOTA_MB) */
    private Integer storageQuotaMb;

    protected AppUser() {}

    public static AppUser create(String email, String displayName, Role role) {
        AppUser u = new AppUser();
        u.id = UUID.randomUUID();
        u.email = email;
        u.displayName = displayName == null || displayName.isBlank() ? email.substring(0, email.indexOf('@')) : displayName.trim();
        u.role = role;
        u.createdAt = Instant.now();
        return u;
    }

    /** the two confirmations every account gives once before using the app */
    public boolean isOnboarded() {
        return adultConfirmedAt != null && healthConsentAt != null;
    }

    public void recordLogin(LoginMethod method) {
        this.lastLoginAt = Instant.now();
        this.lastLoginMethod = method;
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getGoogleSub() {
        return googleSub;
    }

    public void setGoogleSub(String googleSub) {
        this.googleSub = googleSub;
    }

    public String getGoogleEmail() {
        return googleEmail;
    }

    public void setGoogleEmail(String googleEmail) {
        this.googleEmail = googleEmail;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }

    public Role getRole() {
        return role;
    }

    public void setRole(Role role) {
        this.role = role;
    }

    public Status getStatus() {
        return status;
    }

    public void setStatus(Status status) {
        this.status = status;
    }

    public String getLocale() {
        return locale;
    }

    public void setLocale(String locale) {
        this.locale = locale;
    }

    public boolean isLocaleChosen() {
        return localeChosen;
    }

    public void setLocaleChosen(boolean localeChosen) {
        this.localeChosen = localeChosen;
    }

    public Instant getAdultConfirmedAt() {
        return adultConfirmedAt;
    }

    public void setAdultConfirmedAt(Instant adultConfirmedAt) {
        this.adultConfirmedAt = adultConfirmedAt;
    }

    public Instant getHealthConsentAt() {
        return healthConsentAt;
    }

    public void setHealthConsentAt(Instant healthConsentAt) {
        this.healthConsentAt = healthConsentAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }

    public String getUsername() {
        return username;
    }

    public Integer getWaterGoal() {
        return waterGoal;
    }

    public void setWaterGoal(Integer waterGoal) {
        this.waterGoal = waterGoal;
    }

    public String getStreakIcon() {
        return streakIcon == null ? "flame" : streakIcon;
    }

    public void setStreakIcon(String streakIcon) {
        this.streakIcon = streakIcon;
    }

    public String getStreakColor() {
        return streakColor == null ? "orange" : streakColor;
    }

    public void setStreakColor(String streakColor) {
        this.streakColor = streakColor;
    }

    public boolean isDiscoverable() {
        return discoverable;
    }

    public void setDiscoverable(boolean discoverable) {
        this.discoverable = discoverable;
    }

    public Integer getAvatarVersion() {
        return avatarVersion;
    }

    public void setAvatarVersion(Integer avatarVersion) {
        this.avatarVersion = avatarVersion;
    }

    public Long getAvatarBytes() {
        return avatarBytes;
    }

    public void setAvatarBytes(Long avatarBytes) {
        this.avatarBytes = avatarBytes;
    }

    /** the picture the member chose (served by the API, with its version so browsers may keep it); none: the initial */
    public String getPictureUrl() {
        return pictureUrl(id, avatarVersion);
    }

    public static String pictureUrl(UUID id, Integer avatarVersion) {
        return avatarVersion != null ? "/api/users/" + id + "/avatar?v=" + avatarVersion : null;
    }

    public Integer getStorageQuotaMb() {
        return storageQuotaMb;
    }

    public void setStorageQuotaMb(Integer storageQuotaMb) {
        this.storageQuotaMb = storageQuotaMb;
    }

    public LoginMethod getLastLoginMethod() {
        return lastLoginMethod;
    }
}
