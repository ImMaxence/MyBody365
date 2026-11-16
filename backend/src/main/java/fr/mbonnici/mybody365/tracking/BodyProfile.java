package fr.mbonnici.mybody365.tracking;

import fr.mbonnici.mybody365.tracking.BodyMath.Activity;
import fr.mbonnici.mybody365.tracking.BodyMath.Sex;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "body_profile")
public class BodyProfile {

    @Id
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Sex sex;

    @Column(nullable = false)
    private LocalDate birthDate;

    @Column(nullable = false, precision = 4, scale = 1)
    private BigDecimal heightCm;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Activity activityLevel;

    @Column(nullable = false, precision = 5, scale = 2)
    private BigDecimal startWeightKg;

    @Column(nullable = false)
    private LocalDate startDate;

    @Column(nullable = false, precision = 5, scale = 2)
    private BigDecimal goalWeightKg;

    @Column(nullable = false, precision = 3, scale = 2)
    private BigDecimal weeklyRateKg;

    @Column(nullable = false)
    private Instant updatedAt;

    protected BodyProfile() {}

    public BodyProfile(UUID userId) {
        this.userId = userId;
    }

    public void touch() {
        this.updatedAt = Instant.now();
    }

    public UUID getUserId() {
        return userId;
    }

    public Sex getSex() {
        return sex;
    }

    public void setSex(Sex sex) {
        this.sex = sex;
    }

    public LocalDate getBirthDate() {
        return birthDate;
    }

    public void setBirthDate(LocalDate birthDate) {
        this.birthDate = birthDate;
    }

    public BigDecimal getHeightCm() {
        return heightCm;
    }

    public void setHeightCm(BigDecimal heightCm) {
        this.heightCm = heightCm;
    }

    public Activity getActivityLevel() {
        return activityLevel;
    }

    public void setActivityLevel(Activity activityLevel) {
        this.activityLevel = activityLevel;
    }

    public BigDecimal getStartWeightKg() {
        return startWeightKg;
    }

    public void setStartWeightKg(BigDecimal startWeightKg) {
        this.startWeightKg = startWeightKg;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public void setStartDate(LocalDate startDate) {
        this.startDate = startDate;
    }

    public BigDecimal getGoalWeightKg() {
        return goalWeightKg;
    }

    public void setGoalWeightKg(BigDecimal goalWeightKg) {
        this.goalWeightKg = goalWeightKg;
    }

    public BigDecimal getWeeklyRateKg() {
        return weeklyRateKg;
    }

    public void setWeeklyRateKg(BigDecimal weeklyRateKg) {
        this.weeklyRateKg = weeklyRateKg;
    }
}
