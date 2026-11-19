package fr.mbonnici.mybody365.nutrition;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.config.AppProperties;
import java.io.BufferedReader;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.zip.GZIPInputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.task.TaskExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Open Food Facts kept on our side, updated by an admin from the app like Ciqual: the full export (a
 * gzipped, tab-separated file of about 1 GB) is downloaded, then read line by line; the products sold in
 * France with a name and an energy go to the food table (added, or updated by their barcode, so the meals
 * logged with them keep pointing at them). Products that left the export stay: meals may use them.
 * Open Food Facts data: Open Database License, credited in the app and the legal pages.
 */
@Service
public class OffImporter {

    private static final Logger log = LoggerFactory.getLogger(OffImporter.class);
    /** marks that the local copy is there: searches and barcodes stop asking Open Food Facts live */
    static final String STATE_KEY = "off_local_at";
    /**
     * 1.13: the shape of the local copy, written by each import that went through: a copy without it predates the pictures
     * and the product details (size, food group, processing, scans) and is imported again by itself
     */
    static final String FORMAT_KEY = "off_format";
    static final String FORMAT = "1.13";
    /** a month: Open Food Facts changes every day, the local copy follows once a month */
    private static final Duration REFRESH_AFTER = Duration.ofDays(30);
    private static final int BATCH = 1000;

    public record ImportDto(UUID id, String status, String step, int progress, Integer products, String message, Instant startedAt,
            Instant finishedAt, String startedBy) {}

    /** what is kept of a line of the export */
    record Row(String code, String name, String brand, Nutrients per100, String nutriscore, Double servingG, String imagePath, Instant modifiedAt,
            ProductInfo info) {}

    private final JdbcTemplate jdbc;
    private final TaskExecutor executor;
    private final AppProperties props;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15))
            .followRedirects(HttpClient.Redirect.NORMAL).build();

    public OffImporter(JdbcTemplate jdbc, @Qualifier("applicationTaskExecutor") TaskExecutor executor, AppProperties props) {
        this.jdbc = jdbc;
        this.executor = executor;
        this.props = props;
    }

    /** an import cut short by a restart will never finish: say so */
    @EventListener(ApplicationReadyEvent.class)
    public void markInterrupted() {
        jdbc.update("update off_import set status = 'FAILED', message = 'interrupted', finished_at = now() where status = 'RUNNING'");
    }

    /** the local copy is there (at least one import went through) */
    public boolean local() {
        return !jdbc.queryForList("select 1 from app_state where name = ?", Integer.class, STATE_KEY).isEmpty();
    }

    public Instant localAt() {
        return jdbc.queryForList("select updated_at from app_state where name = ?", Timestamp.class, STATE_KEY).stream().findFirst()
                .map(Timestamp::toInstant).orElse(null);
    }

    /**
     * 1.13: the local copy updates itself, without an admin: a few minutes after a start when it predates the pictures and the
     * product details, then once a month. Never twice at once, and not again within a day of a failed try.
     */
    @org.springframework.scheduling.annotation.Scheduled(initialDelayString = "${app.nutrition.off-auto-delay:PT10M}", fixedDelayString = "PT6H")
    public void autoRefresh() {
        if (!props.nutrition().offAutoRefresh() || !local()) {
            return;
        }
        boolean oldFormat = !FORMAT.equals(jdbc.queryForList("select value from app_state where name = ?", String.class, FORMAT_KEY).stream()
                .findFirst().orElse(null));
        Instant at = localAt();
        boolean stale = at == null || at.isBefore(Instant.now().minus(REFRESH_AFTER));
        if (!oldFormat && !stale) {
            return;
        }
        Integer recentFailure = jdbc.queryForObject(
                "select count(*) from off_import where status = 'FAILED' and started_at > now() - interval '1 day'", Integer.class);
        if (recentFailure != null && recentFailure > 0) {
            return;
        }
        try {
            start(null);
            log.info("Open Food Facts: the local copy updates itself ({})", oldFormat ? "older format" : "a month old");
        } catch (ApiException e) {
            // an import already running
        }
    }

    public synchronized ImportDto start(UUID adminId) {
        Integer running = jdbc.queryForObject("select count(*) from off_import where status = 'RUNNING'", Integer.class);
        if (running != null && running > 0) {
            throw ApiException.conflict("import_running");
        }
        UUID id = UUID.randomUUID();
        jdbc.update("insert into off_import (id, status, step, progress, started_by) values (?, 'RUNNING', 'download', 0, ?)", id, adminId);
        executor.execute(() -> run(id, props.nutrition().offDumpUrl()));
        return find(id);
    }

    public ImportDto find(UUID id) {
        return jdbc.query(SELECT + " where i.id = ?", (rs, n) -> map(rs), id).stream().findFirst().orElseThrow(ApiException::notFound);
    }

    public List<ImportDto> history(int limit) {
        return jdbc.query(SELECT + " order by i.started_at desc limit ?", (rs, n) -> map(rs), limit);
    }

    private static final String SELECT = """
            select i.id, i.status, i.step, i.progress, i.products, i.message, i.started_at, i.finished_at, u.display_name
            from off_import i left join app_user u on u.id = i.started_by""";

    private static ImportDto map(java.sql.ResultSet rs) throws java.sql.SQLException {
        Timestamp fin = rs.getTimestamp("finished_at");
        int products = rs.getInt("products");
        return new ImportDto(rs.getObject("id", UUID.class), rs.getString("status"), rs.getString("step"), rs.getInt("progress"),
                rs.wasNull() ? null : products, rs.getString("message"), rs.getTimestamp("started_at").toInstant(),
                fin == null ? null : fin.toInstant(), rs.getString("display_name"));
    }

    void run(UUID id, String url) {
        Path file = null;
        try {
            file = Files.createTempFile("off-", ".csv.gz");
            download(url, file, id);
            int saved = read(file, id);
            if (saved == 0) {
                throw new IllegalStateException("no product sold in France with an energy in this export");
            }
            jdbc.update("""
                    insert into app_state (name, value, updated_at) values (?, ?, now())
                    on conflict (name) do update set value = excluded.value, updated_at = now()""", STATE_KEY, Integer.toString(saved));
            jdbc.update("""
                    insert into app_state (name, value, updated_at) values (?, ?, now())
                    on conflict (name) do update set value = excluded.value, updated_at = now()""", FORMAT_KEY, FORMAT);
            finish(id, "DONE", saved, null);
            log.info("Open Food Facts imported: {} products", saved);
        } catch (Exception e) {
            log.warn("Open Food Facts import failed", e);
            finish(id, "FAILED", null, cause(e));
        } finally {
            if (file != null) {
                try {
                    Files.deleteIfExists(file);
                } catch (IOException ignored) {
                    // a temp file: the OS cleans it eventually
                }
            }
        }
    }

    /** to a file, the progress going from 1 to 50 % */
    private void download(String url, Path target, UUID id) throws IOException, InterruptedException {
        progress(id, "download", 1);
        HttpRequest req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofHours(1)).header("User-Agent", props.nutrition().offUserAgent())
                .GET().build();
        HttpResponse<InputStream> res = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
        if (res.statusCode() >= 400) {
            throw new IOException("HTTP " + res.statusCode() + " on " + url);
        }
        long size = res.headers().firstValueAsLong("Content-Length").orElse(-1);
        try (InputStream in = res.body(); OutputStream out = Files.newOutputStream(target)) {
            byte[] buf = new byte[1 << 16];
            long done = 0;
            int last = 1;
            int r;
            while ((r = in.read(buf)) > 0) {
                out.write(buf, 0, r);
                done += r;
                if (size > 0) {
                    int pct = 1 + (int) (49 * Math.min(1.0, (double) done / size));
                    if (pct > last) {
                        last = pct;
                        progress(id, "download", pct);
                    }
                }
            }
        }
        progress(id, "download", 50);
    }

    /** line by line, the progress going from 50 to 99 % with the compressed bytes read; the products saved by batches */
    int read(Path file, UUID id) throws IOException {
        long size = Files.size(file);
        long[] read = {0};
        String country = props.nutrition().offCountry();
        int saved = 0;
        int last = 50;
        try (InputStream raw = new FilterInputStream(Files.newInputStream(file)) {
                    @Override
                    public int read(byte[] b, int off, int len) throws IOException {
                        int n = super.read(b, off, len);
                        if (n > 0) {
                            read[0] += n;
                        }
                        return n;
                    }
                };
                BufferedReader in = new BufferedReader(new InputStreamReader(new GZIPInputStream(raw, 1 << 16), StandardCharsets.UTF_8), 1 << 20)) {
            String header = in.readLine();
            if (header == null) {
                throw new IllegalStateException("empty export");
            }
            Map<String, Integer> col = new HashMap<>();
            String[] names = header.split("\t", -1);
            for (int i = 0; i < names.length; i++) {
                col.put(names[i].strip(), i);
            }
            for (String need : List.of("code", "product_name", "countries_tags", "energy-kcal_100g")) {
                if (!col.containsKey(need)) {
                    throw new IllegalStateException("column " + need + " missing from the export");
                }
            }
            progress(id, "read", 50);
            Map<String, Row> batch = new LinkedHashMap<>();
            String line;
            while ((line = in.readLine()) != null) {
                // most lines are not sold in France: skipped before being cut into columns
                if (!line.contains(country)) {
                    continue;
                }
                Row row = parse(line.split("\t", -1), col, country);
                if (row != null) {
                    batch.put(row.code(), row);
                }
                if (batch.size() >= BATCH) {
                    saved += save(batch.values());
                    batch.clear();
                    int pct = 50 + (int) (49 * Math.min(1.0, (double) read[0] / size));
                    if (pct > last) {
                        last = pct;
                        progress(id, "read", pct);
                    }
                }
            }
            saved += save(batch.values());
        }
        return saved;
    }

    /** one line of the export, or null when it is not a product sold here with a name and an energy */
    static Row parse(String[] v, Map<String, Integer> col, String country) {
        String countries = get(v, col, "countries_tags");
        if (countries == null || !List.of(countries.split(",")).contains(country)) {
            return null;
        }
        String code = get(v, col, "code");
        if (code == null || !code.matches("\\d{6,14}")) {
            return null;
        }
        String name = get(v, col, "product_name");
        if (name == null) {
            name = get(v, col, "generic_name");
        }
        // the export holds characters the database refuses (a NUL, half an emoji…): taken out
        name = clean(name);
        if (name == null || name.isEmpty()) {
            return null;
        }
        Double kcal = num(get(v, col, "energy-kcal_100g"), 1000);
        if (kcal == null) {
            Double kj = num(get(v, col, "energy_100g"), 4200);
            kcal = kj == null ? null : kj / 4.184;
        }
        if (kcal == null) {
            return null;
        }
        Nutrients n = new Nutrients(round(kcal, 2), num(get(v, col, "proteins_100g"), 100), num(get(v, col, "carbohydrates_100g"), 100),
                num(get(v, col, "sugars_100g"), 100), num(get(v, col, "fat_100g"), 100), num(get(v, col, "saturated-fat_100g"), 100),
                num(get(v, col, "fiber_100g"), 100), num(get(v, col, "salt_100g"), 100));
        String brands = clean(get(v, col, "brands"));
        String brand = brands == null ? null : cut(brands.split(",")[0].strip(), 160);
        String grade = get(v, col, "nutriscore_grade");
        grade = grade != null && grade.matches("[a-eA-E]") ? grade.toLowerCase() : null;
        // 1.12: the front picture and when the page last changed (columns an older export may not have)
        String image = OpenFoodFacts.imagePath(get(v, col, "image_url") != null ? get(v, col, "image_url") : get(v, col, "image_small_url"));
        Instant modified = OpenFoodFacts.epoch(num(get(v, col, "last_modified_t"), 4_000_000_000d));
        // 1.13: to tell the products apart and judge them (columns an older export may not have)
        Double nova = num(get(v, col, "nova_group"), 4);
        Double additives = num(get(v, col, "additives_n"), 200);
        Double scans = num(get(v, col, "unique_scans_n"), 100_000_000);
        String pnns = clean(get(v, col, "pnns_groups_2"));
        ProductInfo info = new ProductInfo(shortText(get(v, col, "quantity"), 60), shortText(get(v, col, "generic_name"), 200),
                pnns == null || pnns.equalsIgnoreCase("unknown") ? null : cut(pnns, 40), nova == null || nova < 1 ? null : (int) Math.round(nova),
                additives == null ? null : (int) Math.round(additives), ProductInfo.sweeteners(get(v, col, "additives_tags")),
                num(get(v, col, "fruits-vegetables-legumes_100g"), 100), scans == null ? null : (int) Math.round(scans));
        return new Row(code, cut(name.strip(), 200), brand == null || brand.isEmpty() ? null : brand, n, grade,
                num(get(v, col, "serving_quantity"), 5000), image, modified, info);
    }

    /** a free text of the export, cleaned and cut, or null */
    static String shortText(String s, int max) {
        String c = clean(s);
        return c == null || c.isEmpty() ? null : cut(c, max);
    }

    /** added, or updated by barcode; a Nutri-Score computed when the export has none */
    private int save(java.util.Collection<Row> rows) {
        if (rows.isEmpty()) {
            return 0;
        }
        List<Object[]> args = new ArrayList<>(rows.size());
        for (Row r : rows) {
            String grade = r.nutriscore() != null ? r.nutriscore() : Nutriscore.grade(r.per100());
            boolean estimated = r.nutriscore() == null && grade != null;
            Nutrients n = r.per100();
            args.add(new Object[] {UUID.randomUUID(), r.code(), r.name(), r.brand(), FoodStore.searchName(r.name(), null, r.brand()), n.kcal(),
                    n.proteinG(), n.carbsG(), n.sugarsG(), n.fatG(), n.satFatG(), n.fiberG(), n.saltG(), grade, estimated, r.servingG(), r.imagePath(),
                    r.modifiedAt() == null ? null : Timestamp.from(r.modifiedAt()), r.info().quantity(), r.info().genericName(), r.info().pnns(),
                    r.info().nova(), r.info().additives(), r.info().sweeteners(), r.info().fruitVeg(), r.info().scans()});
        }
        try {
            jdbc.batchUpdate(UPSERT, args);
            return args.size();
        } catch (org.springframework.dao.DataAccessException e) {
            // one line the database refuses must not stop a million: the batch again, line by line, the bad ones left out
            int ok = 0;
            for (Object[] a : args) {
                try {
                    jdbc.update(UPSERT, a);
                    ok++;
                } catch (org.springframework.dao.DataAccessException one) {
                    log.info("Open Food Facts product {} left out: {}", a[1], cause(one));
                }
            }
            return ok;
        }
    }

    private static final String UPSERT = """
            insert into food (id, source, source_code, name, brand, search_name, kcal, protein_g, carbs_g, sugars_g, fat_g, sat_fat_g,
              fiber_g, salt_g, nutriscore, nutriscore_estimated, serving_g, image_path, source_updated_at, quantity, generic_name, pnns, nova,
              additives, sweeteners, fruit_veg, scans)
            values (?, 'OFF', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict (source_code) where source = 'OFF' do update set name = excluded.name, brand = excluded.brand,
              search_name = excluded.search_name, kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
              sugars_g = excluded.sugars_g, fat_g = excluded.fat_g, sat_fat_g = excluded.sat_fat_g, fiber_g = excluded.fiber_g,
              salt_g = excluded.salt_g, nutriscore = excluded.nutriscore, nutriscore_estimated = excluded.nutriscore_estimated,
              serving_g = excluded.serving_g, image_path = coalesce(excluded.image_path, food.image_path),
              source_updated_at = coalesce(excluded.source_updated_at, food.source_updated_at), quantity = excluded.quantity,
              generic_name = excluded.generic_name, pnns = excluded.pnns, nova = excluded.nova, additives = excluded.additives,
              sweeteners = excluded.sweeteners, fruit_veg = excluded.fruit_veg, scans = excluded.scans, updated_at = now()""";

    /** the reason itself (« invalid byte sequence… »), not the statement around it */
    static String cause(Throwable e) {
        Throwable c = org.springframework.core.NestedExceptionUtils.getMostSpecificCause(e);
        String m = c.getMessage() == null ? c.getClass().getSimpleName() : c.getMessage();
        return m.length() > 480 ? m.substring(0, 480) : m;
    }

    /** without control characters (NUL included) nor half surrogate pairs, spaces collapsed */
    static String clean(String s) {
        if (s == null) {
            return null;
        }
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (Character.isHighSurrogate(c) && i + 1 < s.length() && Character.isLowSurrogate(s.charAt(i + 1))) {
                b.append(c).append(s.charAt(++i));
            } else if (Character.isSurrogate(c) || c < 0x20 || c == 0x7f) {
                b.append(' ');
            } else {
                b.append(c);
            }
        }
        // 1.13: the export writes some apostrophes escaped (« J\'aime le lait d\'ici »)
        return b.toString().replace("\\'", "'").replaceAll("\\s+", " ").strip();
    }

    private static String get(String[] v, Map<String, Integer> col, String name) {
        Integer i = col.get(name);
        if (i == null || i >= v.length) {
            return null;
        }
        String s = v[i].strip();
        return s.isEmpty() ? null : s;
    }

    /** a number within 0..max (the export has typos: 1e6 g of sugar), or null */
    private static Double num(String s, double max) {
        if (s == null) {
            return null;
        }
        try {
            double d = Double.parseDouble(s.replace(',', '.'));
            return Double.isFinite(d) && d >= 0 && d <= max ? round(d, 3) : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static double round(double d, int digits) {
        double f = Math.pow(10, digits);
        return Math.round(d * f) / f;
    }

    private static String cut(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }

    private void progress(UUID id, String step, int pct) {
        jdbc.update("update off_import set step = ?, progress = ? where id = ?", step, pct, id);
    }

    private void finish(UUID id, String status, Integer products, String message) {
        jdbc.update("update off_import set status = ?, progress = 100, products = ?, message = ?, finished_at = now() where id = ?", status,
                products, message, id);
    }
}
