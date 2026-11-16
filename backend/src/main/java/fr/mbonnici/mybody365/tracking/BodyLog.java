package fr.mbonnici.mybody365.tracking;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

/** One day of an account: the weigh-in and, optionally, measurements. */
@Entity
@Table(name = "body_log")
@IdClass(BodyLog.Key.class)
public class BodyLog {

    public static class Key implements Serializable {
        private UUID userId;
        private LocalDate day;

        public Key() {}

        public Key(UUID userId, LocalDate day) {
            this.userId = userId;
            this.day = day;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof Key k && Objects.equals(userId, k.userId) && Objects.equals(day, k.day);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, day);
        }
    }

    @Id
    private UUID userId;

    @Id
    private LocalDate day;

    @Column(precision = 5, scale = 2)
    private BigDecimal weightKg;

    @Column(precision = 4, scale = 1)
    private BigDecimal bodyFatPct;

    @Column(precision = 5, scale = 1)
    private BigDecimal waistCm;

    @Column(precision = 5, scale = 1)
    private BigDecimal hipsCm;

    @Column(precision = 5, scale = 1)
    private BigDecimal chestCm;

    @Column(precision = 5, scale = 1)
    private BigDecimal armCm;

    @Column(precision = 5, scale = 1)
    private BigDecimal thighCm;

    private String note;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    protected BodyLog() {}

    public BodyLog(UUID userId, LocalDate day) {
        this.userId = userId;
        this.day = day;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    public void touch() {
        this.updatedAt = Instant.now();
    }

    public UUID getUserId() {
        return userId;
    }

    public LocalDate getDay() {
        return day;
    }

    public BigDecimal getWeightKg() {
        return weightKg;
    }

    public void setWeightKg(BigDecimal weightKg) {
        this.weightKg = weightKg;
    }

    public BigDecimal getBodyFatPct() {
        return bodyFatPct;
    }

    public void setBodyFatPct(BigDecimal bodyFatPct) {
        this.bodyFatPct = bodyFatPct;
    }

    public BigDecimal getWaistCm() {
        return waistCm;
    }

    public void setWaistCm(BigDecimal waistCm) {
        this.waistCm = waistCm;
    }

    public BigDecimal getHipsCm() {
        return hipsCm;
    }

    public void setHipsCm(BigDecimal hipsCm) {
        this.hipsCm = hipsCm;
    }

    public BigDecimal getChestCm() {
        return chestCm;
    }

    public void setChestCm(BigDecimal chestCm) {
        this.chestCm = chestCm;
    }

    public BigDecimal getArmCm() {
        return armCm;
    }

    public void setArmCm(BigDecimal armCm) {
        this.armCm = armCm;
    }

    public BigDecimal getThighCm() {
        return thighCm;
    }

    public void setThighCm(BigDecimal thighCm) {
        this.thighCm = thighCm;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }
}
