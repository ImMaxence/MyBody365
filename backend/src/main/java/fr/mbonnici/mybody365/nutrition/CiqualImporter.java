package fr.mbonnici.mybody365.nutrition;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.config.AppProperties;
import fr.mbonnici.mybody365.nutrition.CiqualParser.Alim;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.core.task.TaskExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The Ciqual update an admin starts from the app: finds the newest table on the research data
 * repository, downloads it (progress saved as it goes), then adds its foods under the new version.
 * Older versions are never deleted: they are marked superseded, out of the searches, and the meals
 * logged with them stay as they were.
 */
@Service
public class CiqualImporter {

    private static final Logger log = LoggerFactory.getLogger(CiqualImporter.class);
    /** the drinks group: the general Nutri-Score does not apply to them */
    private static final String DRINKS = "06";
    /** vegetables, legumes, fruits: 100 % fruit, vegetables and legumes for the Nutri-Score (not potatoes nor nuts) */
    private static final java.util.Set<String> FRUIT_VEG = java.util.Set.of("0201", "0203", "0204");

    public record ImportDto(UUID id, String version, String status, String step, int progress, Integer foods, String message,
            Instant startedAt, Instant finishedAt, String startedBy) {}

    record FileRef(long id, String name, long size) {}

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final TaskExecutor executor;
    private final JsonMapper json;
    private final AppProperties props;
    private final ApplicationEventPublisher events;

    /** a new table went in (what waited for its foods can follow: the community's first recipes) */
    public record Imported(String version) {}
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15))
            .followRedirects(HttpClient.Redirect.NORMAL).build();

    public CiqualImporter(JdbcTemplate jdbc, TransactionTemplate tx, @Qualifier("applicationTaskExecutor") TaskExecutor executor,
            JsonMapper json, AppProperties props, ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.executor = executor;
        this.json = json;
        this.props = props;
        this.events = events;
    }

    /** an import cut short by a restart will never finish: say so */
    @EventListener(ApplicationReadyEvent.class)
    public void markInterrupted() {
        jdbc.update("update ciqual_import set status = 'FAILED', message = 'interrupted', finished_at = now() where status = 'RUNNING'");
    }

    public ImportDto start(UUID adminId) {
        return start(adminId, props.nutrition().ciqualDatasetUrl());
    }

    /** the dataset URL comes from the configuration only (tests pass a local one) */
    public synchronized ImportDto start(UUID adminId, String datasetUrl) {
        Integer running = jdbc.queryForObject("select count(*) from ciqual_import where status = 'RUNNING'", Integer.class);
        if (running != null && running > 0) {
            throw ApiException.conflict("import_running");
        }
        UUID id = UUID.randomUUID();
        jdbc.update("insert into ciqual_import (id, status, step, progress, started_by) values (?, 'RUNNING', 'dataset', 0, ?)", id,
                adminId);
        executor.execute(() -> run(id, datasetUrl));
        return find(id);
    }

    public ImportDto find(UUID id) {
        return jdbc.query(SELECT + " where i.id = ?", (rs, n) -> map(rs), id).stream().findFirst().orElseThrow(ApiException::notFound);
    }

    public List<ImportDto> history(int limit) {
        return jdbc.query(SELECT + " order by i.started_at desc limit ?", (rs, n) -> map(rs), limit);
    }

    public String currentVersion() {
        List<String> v = jdbc.queryForList(
                "select source_version from food where source = 'CIQUAL' and not superseded group by source_version order by 1 desc limit 1",
                String.class);
        return v.isEmpty() ? null : v.getFirst();
    }

    private static final String SELECT = """
            select i.id, i.version, i.status, i.step, i.progress, i.foods, i.message, i.started_at, i.finished_at, u.display_name
            from ciqual_import i left join app_user u on u.id = i.started_by""";

    private static ImportDto map(java.sql.ResultSet rs) throws java.sql.SQLException {
        Timestamp fin = rs.getTimestamp("finished_at");
        int foods = rs.getInt("foods");
        return new ImportDto(rs.getObject("id", UUID.class), rs.getString("version"), rs.getString("status"), rs.getString("step"),
                rs.getInt("progress"), rs.wasNull() ? null : foods, rs.getString("message"), rs.getTimestamp("started_at").toInstant(),
                fin == null ? null : fin.toInstant(), rs.getString("display_name"));
    }

    void run(UUID id, String datasetUrl) {
        Path dir = null;
        try {
            progress(id, "dataset", 1);
            JsonNode files = json.readTree(fetch(datasetUrl)).path("data").path("latestVersion").path("files");
            FileRef alim = null;
            FileRef compo = null;
            FileRef groups = null;
            for (JsonNode f : files) {
                JsonNode df = f.path("dataFile");
                String name = df.path("filename").asString("");
                FileRef ref = new FileRef(df.path("id").asLong(), name, df.path("filesize").asLong());
                if (name.matches("alim_\\d{4}_\\d{2}_\\d{2}\\.xml")) {
                    alim = ref;
                } else if (name.matches("compo_\\d{4}_\\d{2}_\\d{2}\\.xml")) {
                    compo = ref;
                } else if (name.matches("alim_grp_\\d{4}_\\d{2}_\\d{2}\\.xml")) {
                    groups = ref;
                }
            }
            if (alim == null || compo == null) {
                throw new IllegalStateException("no alim / compo XML file in the dataset");
            }
            String version = alim.name().substring(5, 15);
            jdbc.update("update ciqual_import set version = ? where id = ?", version, id);
            Integer existing = jdbc.queryForObject("select count(*) from food where source = 'CIQUAL' and source_version = ?",
                    Integer.class, version);
            String base = origin(datasetUrl) + "/api/access/datafile/";
            if (existing != null && existing > 0) {
                Integer withMicros = jdbc.queryForObject(
                        "select count(*) from food where source = 'CIQUAL' and source_version = ? and micros is not null", Integer.class, version);
                if (withMicros != null && withMicros > 0) {
                    finish(id, "UP_TO_DATE", existing, null);
                    return;
                }
                // 1.14: the same table, imported before its vitamins and minerals were kept: they are added to it
                dir = Files.createTempDirectory("ciqual-");
                Path compoFile = download(base + compo.id(), dir.resolve("compo.xml"), compo.size(), id, "compo", 10, 80);
                progress(id, "save", 88);
                int updated = saveMicros(version, CiqualParser.compo(compoFile));
                if (updated == 0) {
                    // a table without them: nothing changed
                    finish(id, "UP_TO_DATE", existing, null);
                    return;
                }
                finish(id, "DONE", updated, null);
                log.info("Ciqual {}: vitamins and minerals added to {} foods", version, updated);
                events.publishEvent(new Imported(version));
                return;
            }
            dir = Files.createTempDirectory("ciqual-");
            Path alimFile = download(base + alim.id(), dir.resolve("alim.xml"), alim.size(), id, "foods", 2, 8);
            Path groupFile = groups == null ? null : download(base + groups.id(), dir.resolve("groups.xml"), groups.size(), id, "groups", 8, 10);
            Path compoFile = download(base + compo.id(), dir.resolve("compo.xml"), compo.size(), id, "compo", 10, 75);

            progress(id, "parse", 78);
            Map<String, String> groupNames = groupFile == null ? Map.of() : CiqualParser.groups(groupFile);
            Map<String, Alim> alims = CiqualParser.alims(alimFile);
            Map<String, double[]> values = CiqualParser.compo(compoFile);

            progress(id, "save", 88);
            int saved = save(version, alims, groupNames, values);
            if (saved == 0) {
                throw new IllegalStateException("no food with an energy value in this table");
            }
            finish(id, "DONE", saved, null);
            log.info("Ciqual {} imported: {} foods", version, saved);
            events.publishEvent(new Imported(version));
        } catch (Exception e) {
            log.warn("Ciqual import failed", e);
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            finish(id, "FAILED", null, msg.length() > 480 ? msg.substring(0, 480) : msg);
        } finally {
            if (dir != null) {
                try (Stream<Path> walk = Files.walk(dir)) {
                    walk.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
                } catch (IOException ignored) {
                    // temp files: the OS cleans them eventually
                }
            }
        }
    }

    /** everything in one transaction: a table is there whole or not at all */
    private int save(String version, Map<String, Alim> alims, Map<String, String> groups, Map<String, double[]> values) {
        List<Object[]> rows = new ArrayList<>();
        for (Alim a : alims.values()) {
            double[] v = values.get(a.code());
            if (v == null || Double.isNaN(v[0])) {
                continue;
            }
            Nutrients n = new Nutrients(v[0], nan(v[1]), nan(v[2]), nan(v[3]), nan(v[4]), nan(v[5]), nan(v[6]), nan(v[7]));
            if (n.kcal() < 0 || n.kcal() > 1000) {
                continue;
            }
            String grade = DRINKS.equals(a.group()) ? null : Nutriscore.grade(n, FRUIT_VEG.contains(a.subGroup()) ? 100 : 0);
            String category = groups.getOrDefault(a.subGroup(), groups.get(a.group()));
            String name = cut(a.nameFr(), 200);
            String nameEn = a.nameEn() == null ? null : cut(a.nameEn(), 200);
            rows.add(new Object[] {UUID.randomUUID(), a.code(), version, name, nameEn, category == null ? null : cut(category, 160),
                    FoodStore.searchName(name, nameEn, null), n.kcal(), n.proteinG(), n.carbsG(), n.sugarsG(), n.fatG(), n.satFatG(),
                    n.fiberG(), n.saltG(), grade, grade != null, Micros.json(CiqualParser.micros(v))});
        }
        tx.executeWithoutResult(s -> {
            for (int i = 0; i < rows.size(); i += 500) {
                jdbc.batchUpdate("""
                        insert into food (id, source, source_code, source_version, name, name_en, category, search_name, kcal, protein_g,
                          carbs_g, sugars_g, fat_g, sat_fat_g, fiber_g, salt_g, nutriscore, nutriscore_estimated, micros)
                        values (?, 'CIQUAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)""", rows.subList(i, Math.min(i + 500, rows.size())));
            }
            jdbc.update("update food set superseded = true where source = 'CIQUAL' and source_version <> ? and not superseded", version);
        });
        return rows.size();
    }

    /** 1.14: the vitamins and minerals of a table already imported, set on its foods (by their code) */
    private int saveMicros(String version, Map<String, double[]> values) {
        List<Object[]> rows = new ArrayList<>();
        values.forEach((code, v) -> {
            String json = Micros.json(CiqualParser.micros(v));
            if (json != null) {
                rows.add(new Object[] {json, version, code});
            }
        });
        int[] done = {0};
        tx.executeWithoutResult(s -> {
            for (int i = 0; i < rows.size(); i += 500) {
                for (int n : jdbc.batchUpdate("update food set micros = ?::jsonb where source = 'CIQUAL' and source_version = ? and source_code = ?",
                        rows.subList(i, Math.min(i + 500, rows.size())))) {
                    done[0] += Math.max(0, n);
                }
            }
        });
        return done[0];
    }

    /**
     * 1.14: a table imported before the vitamins and minerals were kept gets them by itself, a few minutes after a start
     * (the same download as an update), unless an admin already did it
     */
    @org.springframework.scheduling.annotation.Scheduled(initialDelayString = "${app.nutrition.ciqual-micros-delay:PT4M}", fixedDelayString = "PT12H")
    public void addMicrosIfMissing() {
        if (!props.nutrition().offAutoRefresh()) {
            return;
        }
        Integer foods = jdbc.queryForObject("select count(*) from food where source = 'CIQUAL' and not superseded", Integer.class);
        Integer withMicros = jdbc.queryForObject("select count(*) from food where source = 'CIQUAL' and not superseded and micros is not null",
                Integer.class);
        Integer recent = jdbc.queryForObject(
                "select count(*) from ciqual_import where status in ('RUNNING', 'FAILED') and started_at > now() - interval '1 day'", Integer.class);
        if (foods == null || foods == 0 || (withMicros != null && withMicros > 0) || (recent != null && recent > 0)) {
            return;
        }
        try {
            start(null);
            log.info("Ciqual: the vitamins and minerals are added to the table in use");
        } catch (RuntimeException e) {
            log.info("Ciqual vitamins not added now: {}", e.getMessage());
        }
    }

    private String fetch(String url) throws IOException, InterruptedException {
        HttpResponse<String> res = http.send(request(url), HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() >= 400) {
            throw new IOException("HTTP " + res.statusCode() + " on " + url);
        }
        return res.body();
    }

    /** to a file, with the progress moving from {@code from} to {@code to} percent */
    private Path download(String url, Path target, long size, UUID id, String step, int from, int to)
            throws IOException, InterruptedException {
        progress(id, step, from);
        HttpResponse<InputStream> res = http.send(request(url), HttpResponse.BodyHandlers.ofInputStream());
        if (res.statusCode() >= 400) {
            throw new IOException("HTTP " + res.statusCode() + " on " + url);
        }
        try (InputStream in = res.body(); OutputStream out = Files.newOutputStream(target)) {
            byte[] buf = new byte[1 << 16];
            long done = 0;
            int last = from;
            int r;
            while ((r = in.read(buf)) > 0) {
                out.write(buf, 0, r);
                done += r;
                if (size > 0) {
                    int pct = from + (int) ((to - from) * Math.min(1.0, (double) done / size));
                    if (pct > last) {
                        last = pct;
                        progress(id, step, pct);
                    }
                }
            }
        }
        progress(id, step, to);
        return target;
    }

    private static HttpRequest request(String url) {
        return HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofMinutes(10)).header("User-Agent", "MyBody365").GET().build();
    }

    private void progress(UUID id, String step, int pct) {
        jdbc.update("update ciqual_import set step = ?, progress = ? where id = ?", step, pct, id);
    }

    private void finish(UUID id, String status, Integer foods, String message) {
        jdbc.update("update ciqual_import set status = ?, progress = 100, foods = ?, message = ?, finished_at = now() where id = ?", status,
                foods, message, id);
    }

    private static String origin(String url) {
        URI u = URI.create(url);
        return u.getScheme() + "://" + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "");
    }

    private static Double nan(double v) {
        return Double.isNaN(v) ? null : v;
    }

    private static String cut(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }
}
