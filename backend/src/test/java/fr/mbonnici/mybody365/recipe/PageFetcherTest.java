package fr.mbonnici.mybody365.recipe;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import fr.mbonnici.mybody365.common.ApiException;
import java.net.InetAddress;
import java.net.URI;
import org.junit.jupiter.api.Test;

/** The recipe import never reaches the private network. */
class PageFetcherTest {

    private static boolean pub(String ip) throws Exception {
        return PageFetcher.Http.isPublic(InetAddress.getByName(ip));
    }

    @Test
    void onlyPublicAddresses() throws Exception {
        assertThat(pub("93.184.216.34")).isTrue();
        assertThat(pub("2606:4700::1111")).isTrue();
        for (String ip : new String[] {"127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.1.10", "169.254.169.254", "100.64.1.1", "0.0.0.0",
                "::1", "fd00::5", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "224.0.0.1"}) {
            assertThat(pub(ip)).as(ip).isFalse();
        }
    }

    @Test
    void onlyWebAddressesOnTheUsualPorts() {
        for (String u : new String[] {"file:///etc/passwd", "ftp://example.com/x", "http://127.0.0.1/", "http://localhost:8080/actuator",
                "https://example.com:8443/", "https://user:pw@example.com/", "http://[::1]/", "http://169.254.169.254/latest/meta-data"}) {
            assertThatThrownBy(() -> PageFetcher.Http.checkPublic(URI.create(u))).as(u).isInstanceOf(ApiException.class);
        }
    }

    @Test
    void readsServingsFromWhatSitesWrite() throws Exception {
        tools.jackson.databind.json.JsonMapper json = tools.jackson.databind.json.JsonMapper.builder().build();
        assertThat(RecipeImporter.servings(json.readTree("\"Pour 14 personnes\""))).isEqualTo(14);
        assertThat(RecipeImporter.servings(json.readTree("[\"4\", \"4 servings\"]"))).isEqualTo(4);
        assertThat(RecipeImporter.servings(json.readTree("6"))).isEqualTo(6);
        assertThat(RecipeImporter.servings(json.readTree("\"une tarte\""))).isNull();
        // 1.20.8: up to 150 portions, a buffet; beyond, a number that is no count of portions
        assertThat(RecipeImporter.servings(json.readTree("\"120\""))).isEqualTo(120);
        assertThat(RecipeImporter.servings(json.readTree("\"151\""))).isNull();
        assertThat(RecipeImporter.decode("Ap&eacute;ro &amp; tapas &#39;maison&#x27;")).isEqualTo("Apéro & tapas 'maison'");
    }
}
