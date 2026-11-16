package fr.mbonnici.mybody365;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class RateLimitTest extends AbstractIntegrationTest {

    @Test
    void accessRequestsAreLimitedPerIp() throws Exception {
        wipe();
        for (int i = 0; i < 5; i++) {
            mvc.perform(post("/api/access-requests").with(csrf()).with(r -> {
                        r.setRemoteAddr("203.0.113.7");
                        return r;
                    }).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"email\":\"p" + i + "@example.com\",\"name\":\"P\",\"kind\":\"NEW_ACCESS\"}"))
                    .andExpect(status().isAccepted());
        }
        mvc.perform(post("/api/access-requests").with(csrf()).with(r -> {
                    r.setRemoteAddr("203.0.113.7");
                    return r;
                }).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"p9@example.com\",\"name\":\"P\",\"kind\":\"NEW_ACCESS\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"));
    }
}
