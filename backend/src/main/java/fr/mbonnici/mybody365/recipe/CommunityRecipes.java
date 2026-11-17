package fr.mbonnici.mybody365.recipe;

import fr.mbonnici.mybody365.nutrition.CiqualImporter;
import fr.mbonnici.mybody365.nutrition.SearchText;
import fr.mbonnici.mybody365.recipe.RecipeService.IngredientInput;
import fr.mbonnici.mybody365.recipe.RecipeService.RecipeInput;
import fr.mbonnici.mybody365.recipe.RecipeService.Type;
import fr.mbonnici.mybody365.recipe.RecipeService.Visibility;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The community's first recipes (1.7): about 200 dishes among the most cooked and the best liked in France, written in
 * resources/community/*.txt, each ingredient a Ciqual food with its weight, so that the calories and the Nutri-Score
 * are computed like any recipe. They belong to the MyBody365 team account, which no one can sign in with: an address
 * of the reserved .invalid domain, no Google link, no passkey, and no invitation nor recovery link can be made for it
 * (AccountLinkService). It is a plain member, its recipes kept in the community by CommunityGuard by name.
 *
 * <p>Each recipe is added once (community_seed keeps its key): one an admin deletes or hides never comes back. A recipe
 * whose foods are not in the Ciqual table yet waits for the next start or the next Ciqual import.
 */
@Component
public class CommunityRecipes {

    private static final Logger log = LoggerFactory.getLogger(CommunityRecipes.class);
    public static final String TEAM_EMAIL = "equipe@mybody365.invalid";
    static final String TEAM_NAME = "MyBody365";

    /** a recipe of the files: its key (the name without accents), and the lines as written */
    public record Seed(String key, String name, List<Type> types, int servings, List<Line> lines, List<String> steps) {}

    public record Line(String code, double grams) {}

    private final JdbcTemplate jdbc;
    private final RecipeService recipes;
    private final TransactionTemplate tx;
    private final boolean enabled;

    public CommunityRecipes(JdbcTemplate jdbc, RecipeService recipes, TransactionTemplate tx,
            @Value("${app.community-seed:true}") boolean enabled) {
        this.jdbc = jdbc;
        this.recipes = recipes;
        this.tx = tx;
        this.enabled = enabled;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        runQuietly();
    }

    /** a new Ciqual table: the recipes that were waiting for its foods can come */
    @EventListener(CiqualImporter.Imported.class)
    public void onCiqual() {
        runQuietly();
    }

    private void runQuietly() {
        if (!enabled) {
            return;
        }
        try {
            run();
        } catch (RuntimeException | IOException e) {
            log.warn("Community recipes not added: {}", e.getMessage());
        }
    }

    /** the recipes of the files not added yet; how many were added */
    public int run() throws IOException {
        return seed(all());
    }

    /** where the first recipes stand, for the admins: how many are in, how many wait, and for which Ciqual foods */
    public record Status(int total, int added, int waiting, List<String> missing) {}

    public Status status() throws IOException {
        List<Seed> all = all();
        Set<String> done = new java.util.HashSet<>(jdbc.queryForList("select key from community_seed", String.class));
        Set<String> known = new java.util.HashSet<>(
                jdbc.queryForList("select source_code from food where source = 'CIQUAL' and not superseded", String.class));
        List<Seed> waiting = all.stream().filter(s -> !done.contains(s.key())).toList();
        List<String> missing = waiting.stream().flatMap(s -> s.lines().stream()).map(Line::code).filter(c -> !known.contains(c)).distinct()
                .sorted().limit(20).toList();
        return new Status(all.size(), all.size() - waiting.size(), waiting.size(), missing);
    }

    /** every recipe of the files, in their order */
    private List<Seed> all() throws IOException {
        Resource[] files = new PathMatchingResourcePatternResolver().getResources("classpath:community/*.txt");
        Arrays.sort(files, Comparator.comparing(Resource::getFilename));
        List<Seed> all = new ArrayList<>();
        for (Resource f : files) {
            all.addAll(parse(f.getContentAsString(StandardCharsets.UTF_8)));
        }
        return all;
    }

    /** adds the seeds not added yet whose foods are all known; how many were added */
    public synchronized int seed(List<Seed> seeds) {
        Set<String> done = new java.util.HashSet<>(jdbc.queryForList("select key from community_seed", String.class));
        List<Seed> todo = seeds.stream().filter(s -> !done.contains(s.key())).toList();
        if (todo.isEmpty()) {
            return 0;
        }
        Map<String, UUID> foods = new HashMap<>();
        jdbc.query("select source_code, id from food where source = 'CIQUAL' and not superseded",
                rs -> {
                    foods.put(rs.getString("source_code"), rs.getObject("id", UUID.class));
                });
        int added = 0;
        int waiting = 0;
        UUID team = null;
        // the last one shared comes first in the community: the files start with the best liked dishes
        for (Seed s : todo.reversed()) {
            if (!s.lines().stream().allMatch(l -> foods.containsKey(l.code()))) {
                waiting++;
                continue;
            }
            if (team == null) {
                team = team();
            }
            UUID owner = team;
            tx.executeWithoutResult(st -> {
                List<IngredientInput> lines = s.lines().stream().map(l -> new IngredientInput(foods.get(l.code()), l.grams())).toList();
                RecipeInput in = new RecipeInput(s.name(), s.types().getFirst(), s.servings(), String.join("\n", s.steps()), true, lines,
                        Visibility.PUBLIC, null, null, null, s.types());
                UUID id = recipes.create(owner, in).id();
                jdbc.update("insert into community_seed (key, recipe_id) values (?, ?) on conflict (key) do nothing", s.key(), id);
            });
            added++;
        }
        if (added > 0 || waiting > 0) {
            log.info("Community recipes: {} added, {} waiting for their Ciqual foods", added, waiting);
        }
        return added;
    }

    /** the team account, created the first time: a plain member (an admin account would be worth stealing) */
    UUID team() {
        List<UUID> found = jdbc.queryForList("select id from app_user where email = ?", UUID.class, TEAM_EMAIL);
        if (!found.isEmpty()) {
            return found.getFirst();
        }
        UUID id = UUID.randomUUID();
        jdbc.update("insert into app_user (id, email, display_name, role, discoverable) values (?, ?, ?, 'USER', false)", id, TEAM_EMAIL,
                TEAM_NAME);
        return id;
    }

    /** an account made before 1.7.1 was an admin: a plain member now (its recipes stay, see CommunityGuard) */
    @EventListener(ApplicationReadyEvent.class)
    @org.springframework.core.annotation.Order(0)
    public void demoteTeam() {
        jdbc.update("update app_user set role = 'USER' where email = ? and role = 'ADMIN'", TEAM_EMAIL);
    }

    /**
     * The text of a file: "= Name | TYPES | servings", then "code grams …" lines and ": step" lines; "#" starts a
     * comment. A malformed line is an error: the files are part of the code and tested.
     */
    public static List<Seed> parse(String text) {
        List<Seed> out = new ArrayList<>();
        String name = null;
        List<Type> types = null;
        int servings = 0;
        List<Line> lines = new ArrayList<>();
        List<String> steps = new ArrayList<>();
        int n = 0;
        for (String raw : text.split("\n")) {
            n++;
            String line = raw.strip();
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }
            if (line.startsWith("= ")) {
                if (name != null) {
                    out.add(seed(name, types, servings, lines, steps));
                }
                String[] parts = line.substring(2).split("\\|");
                if (parts.length != 3) {
                    throw new IllegalArgumentException("line " + n + ": expected « = Name | TYPES | servings »");
                }
                name = parts[0].strip();
                types = new ArrayList<>(new LinkedHashSet<>(Arrays.stream(parts[1].split(",")).map(t -> Type.valueOf(t.strip())).toList()));
                servings = Integer.parseInt(parts[2].strip());
                lines = new ArrayList<>();
                steps = new ArrayList<>();
            } else if (name == null) {
                throw new IllegalArgumentException("line " + n + ": outside a recipe");
            } else if (line.startsWith(":")) {
                steps.add(line.substring(1).strip());
            } else {
                String[] parts = line.split("\\s+", 3);
                if (parts.length < 2 || !parts[0].matches("\\d+") || !parts[1].matches("\\d+([.,]\\d+)?")) {
                    throw new IllegalArgumentException("line " + n + ": expected « code grams »");
                }
                lines.add(new Line(parts[0], Double.parseDouble(parts[1].replace(',', '.'))));
            }
        }
        if (name != null) {
            out.add(seed(name, types, servings, lines, steps));
        }
        return out;
    }

    private static Seed seed(String name, List<Type> types, int servings, List<Line> lines, List<String> steps) {
        return new Seed(SearchText.normalize(name).replace(' ', '-'), name, List.copyOf(types), servings, List.copyOf(lines),
                List.copyOf(steps));
    }
}
