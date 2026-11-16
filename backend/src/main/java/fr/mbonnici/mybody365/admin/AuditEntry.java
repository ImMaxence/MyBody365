package fr.mbonnici.mybody365.admin;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** One line of the admin journal. */
@Entity
@Table(name = "admin_audit")
public class AuditEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private UUID actorId;

    @Column(nullable = false)
    private String actorEmail;

    @Column(nullable = false)
    private String action;

    private String targetType;
    private String targetId;
    private String targetLabel;
    private String details;
    private String ip;

    @Column(nullable = false)
    private Instant createdAt;

    protected AuditEntry() {}

    AuditEntry(UUID actorId, String actorEmail, String action, String targetType, String targetId, String targetLabel,
            String details, String ip) {
        this.actorId = actorId;
        this.actorEmail = actorEmail;
        this.action = action;
        this.targetType = targetType;
        this.targetId = targetId;
        this.targetLabel = targetLabel;
        this.details = details;
        this.ip = ip;
        this.createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public UUID getActorId() {
        return actorId;
    }

    public String getActorEmail() {
        return actorEmail;
    }

    public String getAction() {
        return action;
    }

    public String getTargetType() {
        return targetType;
    }

    public String getTargetId() {
        return targetId;
    }

    public String getTargetLabel() {
        return targetLabel;
    }

    public String getDetails() {
        return details;
    }

    public String getIp() {
        return ip;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
