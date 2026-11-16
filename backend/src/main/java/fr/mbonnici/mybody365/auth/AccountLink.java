package fr.mbonnici.mybody365.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A one-time link made by an admin (see V1__init.sql). Only the token's SHA-256 is stored. */
@Entity
@Table(name = "account_link")
public class AccountLink {

    public enum Kind { INVITE, RECOVERY }

    public enum State { ACTIVE, USED, REVOKED, EXPIRED }

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Kind kind;

    @Column(nullable = false, unique = true)
    private String tokenHash;

    private UUID createdBy;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant expiresAt;

    private Instant usedAt;
    private Instant revokedAt;
    private UUID revokedBy;

    protected AccountLink() {}

    AccountLink(UUID userId, Kind kind, String tokenHash, UUID createdBy, Instant expiresAt) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.kind = kind;
        this.tokenHash = tokenHash;
        this.createdBy = createdBy;
        this.createdAt = Instant.now();
        this.expiresAt = expiresAt;
    }

    public State state(Instant now) {
        if (revokedAt != null) {
            return State.REVOKED;
        }
        if (usedAt != null) {
            return State.USED;
        }
        return now.isBefore(expiresAt) ? State.ACTIVE : State.EXPIRED;
    }

    void markUsed() {
        this.usedAt = Instant.now();
    }

    void revoke(UUID by) {
        this.revokedAt = Instant.now();
        this.revokedBy = by;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public Kind getKind() {
        return kind;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getUsedAt() {
        return usedAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }
}
