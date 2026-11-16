package fr.mbonnici.mybody365.tracking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import fr.mbonnici.mybody365.tracking.BodyMath.Activity;
import fr.mbonnici.mybody365.tracking.BodyMath.Point;
import fr.mbonnici.mybody365.tracking.BodyMath.Sex;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class BodyMathTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 16);

    @Test
    void mifflinStJeor() {
        // 30-year-old man, 80 kg, 180 cm: 10*80 + 6.25*180 - 5*30 + 5 = 1780
        assertThat(BodyMath.bmr(Sex.MALE, 80, 180, 30)).isCloseTo(1780, within(0.01));
        assertThat(BodyMath.bmr(Sex.FEMALE, 65, 165, 28)).isCloseTo(10 * 65 + 6.25 * 165 - 5 * 28 - 161, within(0.01));
        assertThat(BodyMath.tdee(1780, Activity.MODERATE)).isCloseTo(2759, within(0.01));
    }

    @Test
    void theCalorieTargetNeverGoesUnderTheFloor() {
        // 0.5 kg/week = 550 kcal/day
        assertThat(BodyMath.targetKcal(2759, 0.5, true, Sex.MALE)).isEqualTo(2209);
        assertThat(BodyMath.targetKcal(1500, 1.0, true, Sex.FEMALE)).isEqualTo(1200);
        assertThat(BodyMath.targetKcal(2000, 0.25, false, Sex.MALE)).isEqualTo(2275);
    }

    @Test
    void bmiAndTheLowestHealthyGoal() {
        assertThat(BodyMath.bmi(72, 180)).isCloseTo(22.2, within(0.05));
        assertThat(BodyMath.minHealthyWeight(170)).isCloseTo(53.47, within(0.01));
    }

    @Test
    void theTrendSmoothsTheDailyNoise() {
        List<Point> points = List.of(new Point(TODAY.minusDays(2), 80), new Point(TODAY.minusDays(1), 82), new Point(TODAY, 80));
        assertThat(BodyMath.trend(points)).containsExactly(80.0, 80.2, 80.18);
    }

    @Test
    void theRealPaceNeedsEnoughDataThenGivesTheEta() {
        List<Point> few = List.of(new Point(TODAY.minusDays(1), 80), new Point(TODAY, 79.9));
        assertThat(BodyMath.slopePerDay(few, TODAY, 28)).isNull();

        // losing 0.1 kg a day for three weeks
        List<Point> points = new ArrayList<>();
        for (int i = 21; i >= 0; i--) {
            points.add(new Point(TODAY.minusDays(i), 80 - 0.1 * (21 - i)));
        }
        Double slope = BodyMath.slopePerDay(points, TODAY, 28);
        assertThat(slope).isCloseTo(-0.1, within(0.0001));
        assertThat(BodyMath.eta(77.9, 75.9, slope, TODAY)).isEqualTo(TODAY.plusDays(20));
        // gaining while the goal is to lose: no date
        assertThat(BodyMath.eta(80, 75, 0.05, TODAY)).isNull();
        // already there
        assertThat(BodyMath.eta(75.02, 75, -0.1, TODAY)).isEqualTo(TODAY);
    }

    @Test
    void age() {
        assertThat(BodyMath.age(LocalDate.of(2008, 11, 17), TODAY)).isEqualTo(17);
        assertThat(BodyMath.age(LocalDate.of(2008, 11, 16), TODAY)).isEqualTo(18);
    }
}
