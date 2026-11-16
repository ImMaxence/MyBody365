package fr.mbonnici.mybody365.access;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "access_request")
public class AccessRequest {

    public enum Kind { NEW_ACCESS, LOST_ACCESS }

    public enum Status { PENDING, APPROVED, REJECTED }

    @Id
    private UUID id;

    @Column(nullable = false)
    private String email;

    @Column(nullable = false)
    private String name;

    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Kind kind;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.PENDING;

    private String ip;

    @Column(nullable = false)
    private Instant createdAt;

    private Instant decidedAt;
    private UUID decidedBy;

    protected AccessRequest() {}

    AccessRequest(String email, String name, String message, Kind kind, String ip) {
        this.id = UUID.randomUUID();
        this.email = email;
        this.name = name;
        this.message = message;
        this.kind = kind;
        this.ip = ip;
        this.createdAt = Instant.now();
    }

    void refresh(String name, String message, String ip) {
        this.name = name;
        this.message = message;
        this.ip = ip;
        this.createdAt = Instant.now();
    }

    public void decide(Status status, UUID by) {
        this.status = status;
        this.decidedAt = Instant.now();
        this.decidedBy = by;
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getName() {
        return name;
    }

    public String getMessage() {
        return message;
    }

    public Kind getKind() {
        return kind;
    }

    public Status getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }

    public UUID getDecidedBy() {
        return decidedBy;
    }
}
