package fr.mbonnici.mybody365.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class AppPropertiesTest {

    private static AppProperties props(String url, String admins) {
        return new AppProperties(url, List.of(admins), false, false, 24, new AppProperties.RateLimit(true, 600, 20, 5, 120, 60),
                null, null);
    }

    @Test
    void adminEmailsAreSplitTrimmedAndLowerCased() {
        AppProperties p = props("https://mybody365.mbonnici.fr/", " Max@Example.com ; other@example.com;");
        assertThat(p.adminEmails()).containsExactly("max@example.com", "other@example.com");
        assertThat(p.isAdminEmail("MAX@example.com")).isTrue();
        assertThat(p.isAdminEmail("nobody@example.com")).isFalse();
    }

    @Test
    void theAppRefusesToStartWithoutAdmins() {
        assertThatThrownBy(() -> props("https://x.fr", "")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> props("https://x.fr", "${ADMIN_EMAILS}")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> props("https://x.fr", "not-an-email")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void passkeysAreBoundToTheHostOfThePublicUrl() {
        AppProperties prod = props("https://mybody365.mbonnici.fr/", "a@b.fr");
        assertThat(prod.url()).isEqualTo("https://mybody365.mbonnici.fr");
        assertThat(prod.rpId()).isEqualTo("mybody365.mbonnici.fr");
        assertThat(prod.origin()).isEqualTo("https://mybody365.mbonnici.fr");
        assertThat(prod.isLocal()).isFalse();

        AppProperties local = props("http://localhost:4300", "a@b.fr");
        assertThat(local.origin()).isEqualTo("http://localhost:4300");
        assertThat(local.isLocal()).isTrue();
    }
}
