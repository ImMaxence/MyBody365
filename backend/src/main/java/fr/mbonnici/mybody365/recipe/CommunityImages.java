package fr.mbonnici.mybody365.recipe;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.task.TaskExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The photos of the community's recipes (1.11): free photos of Wikimedia Commons, chosen one by one for each dish and
 * listed in resources/community/images.tsv with their author, licence and page, which the recipe shows under its photo.
 * The server downloads each one once (the repository keeps no picture), redraws it like any photo and keeps it with the
 * recipe. One that cannot be read now is tried again at the next start; one an admin removed never comes back.
 */
@Component
public class CommunityImages {

    private static final Logger log = LoggerFactory.getLogger(CommunityImages.class);

    /** a photo of the list: the recipe's key, the picture, its page, who took it, its licence */
    public record Pick(String key, URI url, String page, String author, String license) {}

    private final JdbcTemplate jdbc;
    private final RecipeService recipes;
    private final PageFetcher fetcher;
    private final TaskExecutor executor;
    private final boolean enabled;

    public CommunityImages(JdbcTemplate jdbc, RecipeService recipes, PageFetcher fetcher, @Qualifier("applicationTaskExecutor") TaskExecutor executor,
            @Value("${app.community-images:true}") boolean enabled) {
        this.jdbc = jdbc;
        this.recipes = recipes;
        this.fetcher = fetcher;
        this.executor = executor;
        this.enabled = enabled;
    }

    /** in the background, once the recipes of the files are in (a few seconds after the start) */
    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        if (!enabled) {
            return;
        }
        executor.execute(() -> {
            try {
                Thread.sleep(20_000);
                add(all());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } catch (RuntimeException | IOException e) {
                log.warn("Community photos not added: {}", e.getMessage());
            }
        });
    }

    /** the photos of the file */
    static List<Pick> all() throws IOException {
        return parse(new ClassPathResource("community/images.tsv").getContentAsString(StandardCharsets.UTF_8));
    }

    /** "key TAB picture TAB page TAB author TAB licence" lines; "#" starts a comment; a picture of Wikimedia only */
    public static List<Pick> parse(String text) {
        List<Pick> out = new ArrayList<>();
        int n = 0;
        for (String line : text.split("\n")) {
            n++;
            if (line.isBlank() || line.startsWith("#")) {
                continue;
            }
            String[] p = line.split("\t", -1);
            if (p.length != 5) {
                throw new IllegalArgumentException("line " + n + ": expected 5 columns separated by tabs");
            }
            URI url = URI.create(p[1].strip());
            if (!"https".equals(url.getScheme()) || url.getHost() == null || !url.getHost().endsWith(".wikimedia.org")
                    || !p[2].strip().startsWith("https://commons.wikimedia.org/")) {
                throw new IllegalArgumentException("line " + n + ": a picture and a page of Wikimedia Commons only");
            }
            out.add(new Pick(p[0].strip(), url, p[2].strip(), p[3].strip().isEmpty() ? null : p[3].strip(), p[4].strip()));
        }
        return out;
    }

    /** the photos not added yet whose recipe is there; how many were added */
    public synchronized int add(List<Pick> picks) {
        Set<String> done = new HashSet<>(jdbc.queryForList("select key from community_image", String.class));
        int added = 0;
        int failed = 0;
        for (Pick p : picks) {
            if (done.contains(p.key())) {
                continue;
            }
            List<UUID> ids = jdbc.queryForList("select recipe_id from community_seed where key = ?", UUID.class, p.key());
            if (ids.isEmpty() || ids.getFirst() == null) {
                continue;
            }
            UUID id = ids.getFirst();
            List<String> formats = jdbc.queryForList("select image_format from recipe where id = ?", String.class, id);
            if (formats.isEmpty()) {
                // the recipe was deleted: its photo will never be needed
                mark(p.key(), id);
                continue;
            }
            if (formats.getFirst() != null) {
                // an admin gave it a photo of their own: it stays
                mark(p.key(), id);
                continue;
            }
            try {
                PageFetcher.Photo photo = fetcher.image(p.url());
                recipes.setCommunityImage(id, photo.bytes(), p.author(), p.license(), p.page());
                mark(p.key(), id);
                added++;
                failed = 0;
            } catch (RuntimeException e) {
                log.debug("Community photo of {} not added: {}", p.key(), e.getMessage());
                // no network, or Wikimedia down: the rest waits for the next start
                if (++failed >= 10) {
                    break;
                }
            }
            pause();
        }
        if (added > 0) {
            log.info("Community photos: {} added", added);
        }
        return added;
    }

    private void mark(String key, UUID recipeId) {
        jdbc.update("insert into community_image (key, recipe_id) values (?, ?) on conflict (key) do nothing", key, recipeId);
    }

    /** gently with Wikimedia's servers */
    private void pause() {
        try {
            Thread.sleep(enabled ? 1000 : 0);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
