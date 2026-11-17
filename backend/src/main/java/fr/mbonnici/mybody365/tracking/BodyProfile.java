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

    /** the two answers that replace the level (null on a profile saved before 1.7: the level counts) */
    @Enumerated(EnumType.STRING)
    private BodyMath.Job job;

    private Integer sessionsPerWeek;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MacroSplit macroSplit = MacroSplit.BALANCED;

    /** the target counts on the real needs (meals and weigh-ins of the last weeks) when they are known */
    @Column(nullable = false)
    private boolean adaptiveTdee;

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

    public BodyMath.Job getJob() {
        return job;
    }

    public Integer getSessionsPerWeek() {
        return sessionsPerWeek;
    }

    /** both answers, or none (back to the level) */
    public void setActivity(BodyMath.Job job, Integer sessionsPerWeek) {
        this.job = job;
        this.sessionsPerWeek = job == null ? null : sessionsPerWeek;
    }

    /** the factor of the needs: the two answers when given, else the level chosen before 1.7 */
    public double activityFactor() {
        return job != null && sessionsPerWeek != null ? BodyMath.activityFactor(job, sessionsPerWeek) : activityLevel.factor;
    }

    public MacroSplit getMacroSplit() {
        return macroSplit;
    }

    public boolean isAdaptiveTdee() {
        return adaptiveTdee;
    }

    public void setAdaptiveTdee(boolean adaptiveTdee) {
        this.adaptiveTdee = adaptiveTdee;
    }

    public void setMacroSplit(MacroSplit macroSplit) {
        this.macroSplit = macroSplit;
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
