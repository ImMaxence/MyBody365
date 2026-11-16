package fr.mbonnici.mybody365.photo;

import fr.mbonnici.mybody365.storage.ObjectStorage;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** A body photo: one per pose and per day. The picture itself lives in the object storage. */
@Entity
@Table(name = "photo")
public class Photo {

    public enum Pose { FRONT, SIDE, BACK }

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private LocalDate day;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Pose pose;

    private int width;
    private int height;
    private long bytes;
    private long thumbBytes;

    @Column(nullable = false)
    private String format;

    @Column(nullable = false)
    private Instant createdAt;

    protected Photo() {}

    public Photo(UUID userId, LocalDate day, Pose pose, int width, int height, long bytes, long thumbBytes, String format) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.day = day;
        this.pose = pose;
        this.width = width;
        this.height = height;
        this.bytes = bytes;
        this.thumbBytes = thumbBytes;
        this.format = format;
        this.createdAt = Instant.now();
    }

    public String key() {
        return ObjectStorage.userPrefix(userId) + "p/" + id + "." + format;
    }

    public String thumbKey() {
        return ObjectStorage.userPrefix(userId) + "p/" + id + "_t." + format;
    }

    public String contentType() {
        return "webp".equals(format) ? "image/webp" : "image/jpeg";
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public LocalDate getDay() {
        return day;
    }

    public Pose getPose() {
        return pose;
    }

    public int getWidth() {
        return width;
    }

    public int getHeight() {
        return height;
    }

    public long getBytes() {
        return bytes;
    }

    public long getThumbBytes() {
        return thumbBytes;
    }

    public String getFormat() {
        return format;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
