package fr.mbonnici.mybody365;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import fr.mbonnici.mybody365.auth.DemoSeed;
import fr.mbonnici.mybody365.user.AppUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

/** The local demo account (local sign-in only): every screen has something to show. */
class DemoSeedTest extends AbstractIntegrationTest {

    @Autowired
    DemoSeed demo;

    @Autowired
    TransactionTemplate tx;

    private AppUser admin;

    @BeforeEach
    void setUp() {
        wipe();
        admin = account("admin@example.com", AppUser.Role.ADMIN);
    }

    @Test
    void aDemoAccountWithTwoMonthsOfLifeAndFriends() throws Exception {
        // inside one transaction, as the local sign-in does it
        AppUser lea = tx.execute(s -> demo.create("admin@example.com"));
        mvc.perform(get("/api/me/summary").with(as(lea))).andExpect(status().isOk())
                .andExpect(jsonPath("$.streak.days").isNumber())
                .andExpect(jsonPath("$.goal.trendKgPerWeek").isNumber());
        mvc.perform(get("/api/me/photos").with(as(lea))).andExpect(jsonPath("$.length()").value(9));
        mvc.perform(get("/api/me/friends").with(as(lea)))
                .andExpect(jsonPath("$.friends.length()").value(4))
                .andExpect(jsonPath("$.sharedWithMe.length()").value(1));
        mvc.perform(get("/api/me/friends/requests").with(as(lea))).andExpect(jsonPath("$.received[0].name").value("Sam"));
        mvc.perform(get("/api/me/meals/stats").param("days", "30").with(as(lea))).andExpect(jsonPath("$.daily.length()").value(22));
        mvc.perform(get("/api/recipes/friends").with(as(lea))).andExpect(jsonPath("$[0].name").value("Overnight oats à la banane"));
        mvc.perform(get("/api/me/timers").with(as(lea))).andExpect(jsonPath("$[0].name").value("Gainage du soir"));
        mvc.perform(get("/api/me").with(as(lea))).andExpect(jsonPath("$.waterGoal").value(8));
        // the admin is one of her friends
        mvc.perform(get("/api/me/friends").with(as(admin))).andExpect(jsonPath("$.friends[0].name").value("Léa"));
        // a second one: another account, nothing shared with the first
        demo.create("nobody@example.com");
    }
}
