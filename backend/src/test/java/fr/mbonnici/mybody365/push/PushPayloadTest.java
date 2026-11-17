package fr.mbonnici.mybody365.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;

/** What a phone shows, and where a tap leads. */
class PushPayloadTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> notification(PushService.Kind kind, boolean en, Map<String, String> args) {
        return (Map<String, Object>) PushService.payload(kind, en, args).get("notification");
    }

    @SuppressWarnings("unchecked")
    private static String url(Map<String, Object> n) {
        Map<String, Object> data = (Map<String, Object>) n.get("data");
        Map<String, Object> click = (Map<String, Object>) ((Map<String, Object>) data.get("onActionClick")).get("default");
        return (String) click.get("url");
    }

    @Test
    void aFriendsRecipeOpensTheRecipe() {
        Map<String, Object> fr = notification(PushService.Kind.FRIEND_RECIPE, false,
                Map.of("name", "Léa", "recipe", "Bruschetta", "path", "/app/meals/recipes/42"));
        assertThat(fr.get("title")).isEqualTo("Léa a partagé une recette 🍳");
        assertThat(fr.get("body")).isEqualTo("Bruschetta, à découvrir dans les recettes de tes amis");
        assertThat(url(fr)).isEqualTo("/app/meals/recipes/42");
        assertThat(notification(PushService.Kind.FRIEND_RECIPE, true, Map.of("name", "Léa", "recipe", "Bruschetta")).get("title"))
                .isEqualTo("Léa shared a recipe 🍳");
        // only an address of the app
        assertThat(url(notification(PushService.Kind.FRIEND_RECIPE, false, Map.of("path", "https://evil.example/")))).isEqualTo("/app/meals/recipes");
    }
}
