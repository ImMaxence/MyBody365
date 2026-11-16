package fr.mbonnici.mybody365.tracking;

import java.time.LocalDate;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * The flame, worked out from the weigh-ins alone (nothing stored, nothing to drift):
 * <ul>
 * <li>every day with a weigh-in makes it grow;</li>
 * <li>every 7 days validated in a row earn a freeze (2 at most in stock);</li>
 * <li>a missed day uses a freeze if there is one (the day shows as frozen, the flame keeps its count),
 * otherwise the flame goes out;</li>
 * <li>today is never missed before it is over.</li>
 * </ul>
 */
public final class Streaks {

    public enum State { DONE, FROZEN, MISSED, TODAY }

    public static final int FREEZE_EVERY = 7;
    public static final int MAX_FREEZES = 2;

    public record Result(int days, int best, int freezes, boolean todayDone, Map<LocalDate, State> states) {

        public State state(LocalDate day) {
            return states.get(day);
        }
    }

    private Streaks() {}

    public static Result compute(Set<LocalDate> done, LocalDate today) {
        LocalDate first = done.stream().filter(d -> !d.isAfter(today)).min(LocalDate::compareTo).orElse(null);
        if (first == null) {
            return new Result(0, 0, 0, false, Collections.emptyMap());
        }
        int streak = 0;
        int best = 0;
        int freezes = 0;
        int sinceEarned = 0;
        Map<LocalDate, State> states = new HashMap<>();
        for (LocalDate d = first; !d.isAfter(today); d = d.plusDays(1)) {
            if (done.contains(d)) {
                streak++;
                sinceEarned++;
                if (sinceEarned >= FREEZE_EVERY) {
                    freezes = Math.min(MAX_FREEZES, freezes + 1);
                    sinceEarned = 0;
                }
                states.put(d, State.DONE);
            } else if (d.equals(today)) {
                states.put(d, State.TODAY);
            } else if (streak > 0 && freezes > 0) {
                freezes--;
                states.put(d, State.FROZEN);
            } else {
                streak = 0;
                sinceEarned = 0;
                states.put(d, State.MISSED);
            }
            best = Math.max(best, streak);
        }
        return new Result(streak, best, freezes, done.contains(today), states);
    }
}
