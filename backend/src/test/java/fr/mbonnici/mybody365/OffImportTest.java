package fr.mbonnici.mybody365;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import fr.mbonnici.mybody365.user.AppUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Open Food Facts kept on our side: the export read, the products sold in France kept, searches and barcodes answered locally. */
class OffImportTest extends AbstractIntegrationTest {

    private AppUser admin;
    private AppUser lea;

    @BeforeEach
    void setUp() {
        wipe();
        clean();
        admin = account("admin@example.com", AppUser.Role.ADMIN);
        lea = account("lea@example.com", AppUser.Role.USER);
    }

    /** the other tests ask Open Food Facts "live" (faked): the local copy goes away after this one */
    @AfterEach
    void clean() {
        jdbc.update("delete from app_state where name = 'off_local_at'");
        jdbc.update("delete from food where source = 'OFF' and (source_code like '3560070%' or source_code = '4000000000003')");
        jdbc.update("delete from off_import");
    }

    private String importOff() throws Exception {
        String id = JsonPath.read(mvc.perform(post("/api/admin/foods/off/import").with(as(admin)).with(csrf())).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RUNNING")).andReturn().getResponse().getContentAsString(), "$.id");
        for (int i = 0; i < 100; i++) {
            String s = mvc.perform(get("/api/admin/foods/off/imports/" + id).with(as(admin))).andReturn().getResponse().getContentAsString();
            if (!"RUNNING".equals(JsonPath.read(s, "$.status"))) {
                return s;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("the import did not finish");
    }

    private String search(String q, String source) throws Exception {
        return mvc.perform(get("/api/foods/search").param("q", q).param("source", source).with(as(lea))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    void theLocalCopyAnswersSearchesAndBarcodes() throws Exception {
        mvc.perform(post("/api/admin/foods/off/import").with(as(lea)).with(csrf())).andExpect(status().isForbidden());

        String done = importOff();
        assertThat((String) JsonPath.read(done, "$.status")).isEqualTo("DONE");
        // sold in France with an energy: the kebab (listed twice), the bread (its generic name, kJ only), the typo (kept, its sugar dropped)
        assertThat((Integer) JsonPath.read(done, "$.products")).isEqualTo(3);
        mvc.perform(get("/api/admin/foods").with(as(admin))).andExpect(jsonPath("$.offLocalAt").exists())
                .andExpect(jsonPath("$.offImports[0].status").value("DONE"));

        String found = search("kebab", "off");
        assertThat(found).contains("Kebab poulet sauce blanche").contains("Pain à kebab").doesNotContain("Bratwurst");
        assertThat((String) JsonPath.read(found, "$[0].source")).isEqualTo("OFF");
        assertThat(found).contains("\"brand\":\"Snack Maison\"");
        // 1.13: its size, its food group, how processed it is, and its health score (an ultra-processed dish)
        assertThat(found).contains("\"quantity\":\"500 g\"");
        assertThat(found).contains("\"kind\":\"One-dish meals\"").contains("\"nova\":4");
        java.util.List<Double> score = JsonPath.read(found, "$[?(@.name == 'Kebab poulet sauce blanche')].health.score");
        assertThat(score.getFirst()).isBetween(0.0, 6.0);
        assertThat(jdbc.queryForObject("select sweeteners from food where source = 'OFF' and source_code = '3560070000001'", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("select scans from food where source = 'OFF' and source_code = '3560070000001'", Integer.class)).isEqualTo(42);
        // « unknown » is no food group; 33 cl is a drink's size
        assertThat(jdbc.queryForObject("select pnns from food where source = 'OFF' and source_code = '3560070000005'", String.class)).isNull();
        java.util.List<Double> bread = JsonPath.read(found, "$[?(@.name == 'Pain à kebab')].per100.kcal");
        assertThat(bread).hasSize(1);
        assertThat(bread.getFirst()).isCloseTo(262.9, org.assertj.core.data.Offset.offset(0.1));
        // the products have their own list: not among "foods" any more
        assertThat(search("kebab", "local")).doesNotContain("Kebab poulet");
        // the typo is dropped, not the product
        String typo = search("erreur saisie", "off");
        assertThat(typo).contains("Erreur de saisie").doesNotContain("sugarsG");

        // a barcode: from the local copy
        mvc.perform(get("/api/foods/barcode/3560070000001").with(as(lea))).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Kebab poulet sauce blanche")).andExpect(jsonPath("$.nutriscore").value("c"))
                .andExpect(jsonPath("$.servingG").value(250.0));

        // again: updated in place, never twice
        assertThat((Integer) JsonPath.read(importOff(), "$.products")).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from food where source = 'OFF' and source_code = '3560070000001'", Integer.class))
                .isEqualTo(1);
    }
}
