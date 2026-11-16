package fr.mbonnici.mybody365.tracking;

import static org.assertj.core.api.Assertions.assertThat;

import fr.mbonnici.mybody365.tracking.Streaks.State;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class StreaksTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 16);

    private static Set<LocalDate> days(int fromAgo, int toAgo, int... skippedAgo) {
        Set<LocalDate> s = new HashSet<>();
        for (int i = fromAgo; i >= toAgo; i--) {
            s.add(TODAY.minusDays(i));
        }
        for (int k : skippedAgo) {
            s.remove(TODAY.minusDays(k));
        }
        return s;
    }

    @Test
    void sevenDaysInARowEarnAFreezeThatSavesAMissedDay() {
        // 10 days ago → yesterday, except 3 days ago: the 7 first days earned a freeze, used on the missed day
        Streaks.Result r = Streaks.compute(days(10, 1, 3), TODAY);
        assertThat(r.state(TODAY.minusDays(3))).isEqualTo(State.FROZEN);
        assertThat(r.days()).isEqualTo(9);
        assertThat(r.freezes()).isZero();
        // today is not over: still alive, not missed
        assertThat(r.state(TODAY)).isEqualTo(State.TODAY);
        assertThat(r.todayDone()).isFalse();
    }

    @Test
    void withoutAFreezeAMissedDayPutsTheFlameOut() {
        Streaks.Result r = Streaks.compute(days(6, 0, 3), TODAY);
        assertThat(r.state(TODAY.minusDays(3))).isEqualTo(State.MISSED);
        assertThat(r.days()).isEqualTo(3);
        assertThat(r.best()).isEqualTo(3);
        assertThat(r.todayDone()).isTrue();
    }

    @Test
    void freezesStackUpToTwo() {
        Streaks.Result r = Streaks.compute(days(29, 0), TODAY);
        assertThat(r.days()).isEqualTo(30);
        assertThat(r.freezes()).isEqualTo(2);
        // two missed days in a row: both frozen
        Streaks.Result gap = Streaks.compute(days(29, 0, 2, 1), TODAY);
        assertThat(gap.state(TODAY.minusDays(1))).isEqualTo(State.FROZEN);
        assertThat(gap.state(TODAY.minusDays(2))).isEqualTo(State.FROZEN);
        assertThat(gap.days()).isEqualTo(28);
    }

    @Test
    void nothingYet() {
        assertThat(Streaks.compute(Set.of(), TODAY).days()).isZero();
    }
}
