package fr.mbonnici.mybody365.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 1.19: the usual time of the weigh-in (or the photo), and the reminder 20 minutes after it. */
class SmartTimesTest {

    @Test
    void theReminderComesTwentyMinutesAfterTheMiddleTime() {
        // 7:10, 7:20, 7:25, 7:30, 9:50 (one late Sunday): the middle one, 7:25, + 20 → 7:45
        assertThat(SmartTimes.usual(List.of(430, 440, 445, 450, 590))).isEqualTo(LocalTime.of(7, 45));
        // even: between the two middle ones, on a 5-minute step
        assertThat(SmartTimes.usual(List.of(430, 440, 450, 460, 470, 480))).isEqualTo(LocalTime.of(7, 55));
    }

    @Test
    void notEnoughDaysOrTooEarlyOrLate() {
        assertThat(SmartTimes.usual(List.of(430, 440, 450, 460))).isNull();
        assertThat(SmartTimes.usual(List.of(60, 70, 80, 90, 100))).isEqualTo(LocalTime.of(5, 0));
        assertThat(SmartTimes.usual(List.of(1430, 1430, 1435, 1438, 1439))).isEqualTo(LocalTime.of(22, 55));
    }
}
