package fr.mbonnici.mybody365.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import fr.mbonnici.mybody365.AbstractIntegrationTest;
import fr.mbonnici.mybody365.user.AppUser;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

/** 1.7: the timer's changes of phase, handed to the server while the app is off screen. */
class TimerAlertsTest extends AbstractIntegrationTest {

    @Autowired
    private TimerAlerts alerts;

    private AppUser lea;

    @BeforeEach
    void setUp() {
        wipe();
        lea = account("lea@example.com", AppUser.Role.USER);
    }

    private String body(Instant... ats) {
        StringBuilder b = new StringBuilder("{\"alerts\":[");
        for (int i = 0; i < ats.length; i++) {
            b.append(i == 0 ? "" : ",").append("{\"at\":\"").append(ats[i]).append("\",\"phase\":\"").append(i % 2 == 0 ? "REST" : "WORK")
                    .append("\",\"round\":1,\"total\":3}");
        }
        return b.append("]}").toString();
    }

    @Test
    void theAlertsAreScheduledReplacedAndCancelled() throws Exception {
        Instant soon = Instant.now().plusSeconds(600);
        mvc.perform(put("/api/me/timer/alerts").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body(soon, soon.plusSeconds(30), soon.plusSeconds(60)))).andExpect(status().isNoContent());
        assertThat(alerts.waiting(lea.getId())).isEqualTo(3);

        // the app went off screen again later: the new list takes the place of the old one
        mvc.perform(put("/api/me/timer/alerts").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body(soon.plusSeconds(90)))).andExpect(status().isNoContent());
        assertThat(alerts.waiting(lea.getId())).isEqualTo(1);

        // back on screen
        mvc.perform(delete("/api/me/timer/alerts").with(as(lea)).with(csrf())).andExpect(status().isNoContent());
        assertThat(alerts.waiting(lea.getId())).isZero();
    }

    @Test
    void aTimerHasLimits() throws Exception {
        // further than a run can last
        mvc.perform(put("/api/me/timer/alerts").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body(Instant.now().plusSeconds(5 * 3600)))).andExpect(status().isBadRequest());
        // too many
        Instant[] many = new Instant[65];
        for (int i = 0; i < many.length; i++) {
            many[i] = Instant.now().plusSeconds(60 + i);
        }
        mvc.perform(put("/api/me/timer/alerts").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body(many)))
                .andExpect(status().isBadRequest());
        // a round beyond the total
        mvc.perform(put("/api/me/timer/alerts").with(as(lea)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"alerts\":[{\"at\":\"" + Instant.now().plusSeconds(60) + "\",\"phase\":\"WORK\",\"round\":4,\"total\":3}]}"))
                .andExpect(status().isBadRequest());
        // signed in only
        mvc.perform(put("/api/me/timer/alerts").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body(Instant.now())))
                .andExpect(status().isUnauthorized());
        assertThat(alerts.waiting(lea.getId())).isZero();
    }
}
