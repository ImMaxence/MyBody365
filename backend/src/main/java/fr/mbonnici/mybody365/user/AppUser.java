package fr.mbonnici.mybody365.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_user")
public class AppUser {

    public enum Role { USER, ADMIN }

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

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role = Role.USER;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.ACTIVE;

    @Column(nullable = false)
    private String locale = "fr";

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
