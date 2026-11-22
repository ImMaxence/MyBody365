package fr.mbonnici.mybody365.backup;

import fr.mbonnici.mybody365.backup.BackupFormat.Table;
import fr.mbonnici.mybody365.backup.BackupFormat.Type;
import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.storage.ObjectStorage;
import fr.mbonnici.mybody365.storage.QuotaService;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * Backups of an account: everything it entered and every picture, in one zip. A restore always starts
 * with a preview of what would change; nothing is written before it is confirmed.
 */
@Service
public class BackupService {

    private static final Logger log = LoggerFactory.getLogger(BackupService.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Duration PREVIEW_LIFE = Duration.ofHours(1);
    /** the only names a backup may contain: no path can escape, nothing else is read */
    private static final Pattern ENTRY = Pattern.compile(
            "manifest\\.json|data\\.json|(photos|recipes)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_t)?\\.(webp|jpeg)");
    private static final long MAX_ENTRY = 40L * 1024 * 1024;
    private static final long MAX_TOTAL = 4L * 1024 * 1024 * 1024;
    private static final int MAX_ENTRIES = 30_000;

    public enum Mode { MERGE, REPLACE }

    public record Change(int added, int changed, int removed, int same, List<String> examples) {}

    public record Preview(String token, String exportedAt, String appVersion, boolean profile, Map<String, Change> changes) {}

    public record Result(int logs, int photos, int meals, int foods, int recipes, int workouts, int water, int timers, int milestones,
            /** 1.17 */
            int bloodPressure, int medications) {}

    /** a weight as a key: « 80.0 » whether it came as 80, 80.0 or a BigDecimal */
    private static String kg(Object v) {
        return v instanceof Number n ? String.valueOf(Math.round(n.doubleValue() * 10) / 10.0) : String.valueOf(v);
    }

    /** what a backup file holds, read and checked */
    record Parsed(Map<String, Object> manifest, Map<String, Object> data, Set<String> files, long filesBytes) {}

    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final ObjectStorage storage;
    private final QuotaService quota;
    private final TransactionTemplate tx;

    private final fr.mbonnici.mybody365.config.AppProperties props;

    public BackupService(JdbcTemplate jdbc, JsonMapper json, ObjectStorage storage, QuotaService quota, TransactionTemplate tx,
            fr.mbonnici.mybody365.config.AppProperties props) {
        this.props = props;
        this.jdbc = jdbc;
        this.json = json;
        this.storage = storage;
        this.quota = quota;
        this.tx = tx;
    }

    /** an admin by role or by ADMIN_EMAILS */
    private boolean admin(UUID userId) {
        return jdbc.queryForList("select role, email from app_user where id = ?", userId).stream()
                .anyMatch(u -> "ADMIN".equals(u.get("role")) || props.isAdminEmail((String) u.get("email")));
    }

    // ── export ───────────────────────────────────────────────────────────────

    public void export(UUID userId, String appVersion, OutputStream out) throws IOException {
        Map<String, Object> data = new LinkedHashMap<>();
        List<Map<String, Object>> profile = rows(BackupFormat.PROFILE, "user_id = ?", userId);
        data.put("profile", profile.isEmpty() ? null : profile.getFirst());
        data.put("logs", rows(BackupFormat.LOGS, "user_id = ? order by day", userId));
        data.put("foods", rows(BackupFormat.FOODS, "source = 'USER' and owner_id = ? order by name", userId));
        List<Map<String, Object>> recipes = rows(BackupFormat.RECIPES, "owner_id = ? order by created_at", userId);
        Map<Object, List<Map<String, Object>>> ingredients = rows(BackupFormat.INGREDIENTS,
                "recipe_id in (select id from recipe where owner_id = ?) order by recipe_id, position", userId).stream()
                .collect(Collectors.groupingBy(r -> r.get("recipe_id"), LinkedHashMap::new, Collectors.toList()));
        for (Map<String, Object> r : recipes) {
            r.put("ingredients", ingredients.getOrDefault(r.get("id"), List.of()));
        }
        data.put("recipes", recipes);
        data.put("meals", rows(BackupFormat.MEALS, "user_id = ? order by day, created_at", userId));
        List<Map<String, Object>> photos = rows(BackupFormat.PHOTOS, "user_id = ? order by day", userId);
        data.put("photos", photos);
        data.put("workouts", rows(BackupFormat.WORKOUTS, "user_id = ? order by day", userId));
        data.put("water", rows(BackupFormat.WATER, "user_id = ? order by day", userId));
        data.put("bp", rows(BackupFormat.BP, "user_id = ? order by day, moment", userId));
        data.put("medications", rows(BackupFormat.MEDICATIONS, "user_id = ? order by created_at", userId));
        data.put("timers", rows(BackupFormat.TIMERS, "user_id = ? order by created_at", userId));
        data.put("milestones", rows(BackupFormat.MILESTONES, "user_id = ? order by target_kg", userId));
        List<Map<String, Object>> prefs = rows(BackupFormat.PREFS, "user_id = ?", userId);
        data.put("notifications", prefs.isEmpty() ? null : prefs.getFirst());

        Map<String, Object> manifest = new LinkedHashMap<>();
        manifest.put("format", BackupFormat.FORMAT);
        manifest.put("version", BackupFormat.VERSION);
        manifest.put("appVersion", appVersion);
        manifest.put("exportedAt", Instant.now().toString());

        ZipOutputStream zip = new ZipOutputStream(out);
        write(zip, "manifest.json", json.writerWithDefaultPrettyPrinter().writeValueAsBytes(manifest));
        write(zip, "data.json", json.writeValueAsBytes(data));
        String prefix = ObjectStorage.userPrefix(userId);
        for (Map<String, Object> p : photos) {
            String name = p.get("id") + "." + p.get("format");
            String thumb = p.get("id") + "_t." + p.get("format");
            copy(zip, prefix + "p/" + name, "photos/" + name);
            copy(zip, prefix + "p/" + thumb, "photos/" + thumb);
        }
        for (Map<String, Object> r : recipes) {
            if (r.get("image_format") == null) {
                continue;
            }
            Integer version = jdbc.queryForObject("select image_version from recipe where id = ?::uuid", Integer.class, r.get("id"));
            String fmt = (String) r.get("image_format");
            copy(zip, prefix + "r/" + r.get("id") + "_" + version + "." + fmt, "recipes/" + r.get("id") + "." + fmt);
            copy(zip, prefix + "r/" + r.get("id") + "_" + version + "_t." + fmt, "recipes/" + r.get("id") + "_t." + fmt);
        }
        zip.finish();
        zip.flush();
    }

    private List<Map<String, Object>> rows(Table t, String where, Object... args) {
        String sql = "select " + String.join(", ", t.names()) + " from " + t.name() + " where " + where;
        return jdbc.queryForList(sql, args).stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            for (String c : t.names()) {
                m.put(c, BackupFormat.toJson(r.get(c)));
            }
            return m;
        }).collect(Collectors.toCollection(ArrayList::new));
    }

    private static void write(ZipOutputStream zip, String name, byte[] bytes) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(bytes);
        zip.closeEntry();
    }

    private void copy(ZipOutputStream zip, String key, String name) throws IOException {
        byte[] bytes = storage.get(key);
        if (bytes != null) {
            write(zip, name, bytes);
        }
    }

    // ── preview ──────────────────────────────────────────────────────────────

    /** reads a backup file, keeps it an hour, and tells what restoring it would change */
    public Preview preview(UUID userId, Path file) {
        Parsed p = parse(file);
        byte[] raw = new byte[24];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        String key = ObjectStorage.userPrefix(userId) + "restore/" + token + ".zip";
        storage.putFile(key, file, "application/zip");
        jdbc.update("insert into restore_upload (token, user_id, storage_key) values (?, ?, ?)", token, userId, key);
        return new Preview(token, str(p.manifest().get("exportedAt")), str(p.manifest().get("appVersion")), p.data().get("profile") != null,
                diff(userId, p.data()));
    }

    @SuppressWarnings("unchecked")
    Parsed parse(Path file) {
        try (ZipFile zip = new ZipFile(file.toFile())) {
            if (zip.size() > MAX_ENTRIES) {
                throw ApiException.badRequest("backup_invalid");
            }
            Set<String> files = new HashSet<>();
            long total = 0;
            for (ZipEntry e : zip.stream().toList()) {
                if (e.isDirectory()) {
                    continue;
                }
                if (!ENTRY.matcher(e.getName()).matches()) {
                    continue;
                }
                if (e.getSize() > MAX_ENTRY) {
                    throw ApiException.badRequest("backup_invalid");
                }
                total += Math.max(0, e.getSize());
                if (total > MAX_TOTAL) {
                    throw ApiException.badRequest("backup_invalid");
                }
                if (e.getName().contains("/")) {
                    files.add(e.getName());
                }
            }
            Map<String, Object> manifest = json.readValue(read(zip, "manifest.json"), Map.class);
            Object version = manifest.get("version");
            if (!BackupFormat.FORMAT.equals(manifest.get("format")) || !(version instanceof Number n) || n.intValue() > BackupFormat.VERSION) {
                throw ApiException.badRequest("backup_invalid");
            }
            Map<String, Object> data = json.readValue(read(zip, "data.json"), Map.class);
            long filesBytes = files.stream().mapToLong(f -> Math.max(0, zip.getEntry(f).getSize())).sum();
            return new Parsed(manifest, data, files, filesBytes);
        } catch (ApiException e) {
            throw e;
        } catch (IOException | RuntimeException e) {
            throw ApiException.badRequest("backup_invalid");
        }
    }

    /** an entry read with a hard limit, whatever size its header claims */
    static byte[] read(ZipFile zip, String name) throws IOException {
        ZipEntry e = zip.getEntry(name);
        if (e == null) {
            throw ApiException.badRequest("backup_invalid");
        }
        try (InputStream in = zip.getInputStream(e)) {
            byte[] bytes = in.readNBytes((int) MAX_ENTRY + 1);
            if (bytes.length > MAX_ENTRY) {
                throw ApiException.badRequest("backup_invalid");
            }
            return bytes;
        }
    }

    Map<String, Change> diff(UUID userId, Map<String, Object> data) {
        Map<String, Change> out = new LinkedHashMap<>();
        out.put("logs", compare(keyed(rows(BackupFormat.LOGS, "user_id = ?", userId), r -> str(r.get("day"))),
                keyed(list(data, "logs"), r -> str(r.get("day"))), r -> r.toString()));
        out.put("photos", compare(keyed(rows(BackupFormat.PHOTOS, "user_id = ?", userId), r -> r.get("day") + " " + r.get("pose")),
                keyed(list(data, "photos"), r -> r.get("day") + " " + r.get("pose")), r -> r.get("width") + "x" + r.get("height")));
        out.put("meals", compare(byDay(rows(BackupFormat.MEALS, "user_id = ?", userId)), byDay(list(data, "meals")), r -> str(r.get("sig"))));
        out.put("foods", compare(keyed(rows(BackupFormat.FOODS, "source = 'USER' and owner_id = ?", userId), r -> lower(r.get("name"))),
                keyed(list(data, "foods"), r -> lower(r.get("name"))), r -> r.get("kcal") + "/" + r.get("brand")));
        out.put("recipes", compare(keyed(rows(BackupFormat.RECIPES, "owner_id = ?", userId), r -> lower(r.get("name"))),
                keyed(list(data, "recipes"), r -> lower(r.get("name"))), r -> r.get("servings") + "/" + r.get("kcal")));
        out.put("workouts", compare(keyed(rows(BackupFormat.WORKOUTS, "user_id = ?", userId), BackupService::workoutKey),
                keyed(list(data, "workouts"), BackupService::workoutKey), r -> ""));
        out.put("water", compare(keyed(rows(BackupFormat.WATER, "user_id = ?", userId), r -> str(r.get("day"))),
                keyed(list(data, "water"), r -> str(r.get("day"))), r -> String.valueOf(r.get("glasses"))));
        out.put("bp", compare(keyed(rows(BackupFormat.BP, "user_id = ?", userId), r -> r.get("day") + " " + r.get("moment")),
                keyed(list(data, "bp"), r -> r.get("day") + " " + r.get("moment")), r -> r.get("systolic") + "/" + r.get("diastolic")));
        out.put("medications", compare(keyed(rows(BackupFormat.MEDICATIONS, "user_id = ?", userId), r -> lower(r.get("name"))),
                keyed(list(data, "medications"), r -> lower(r.get("name"))), r -> r.get("dose") + "/" + r.get("times") + "/" + r.get("days")));
        out.put("timers", compare(keyed(rows(BackupFormat.TIMERS, "user_id = ?", userId), r -> lower(r.get("name"))),
                keyed(list(data, "timers"), r -> lower(r.get("name"))), r -> r.get("work_s") + "/" + r.get("rest_s") + "/" + r.get("rounds")));
        out.put("milestones", compare(keyed(rows(BackupFormat.MILESTONES, "user_id = ?", userId), r -> kg(r.get("target_kg"))),
                keyed(list(data, "milestones"), r -> kg(r.get("target_kg"))), r -> String.valueOf(r.get("reward"))));
        return out;
    }

    private static String workoutKey(Map<String, Object> r) {
        return r.get("day") + " " + r.get("program") + "/" + r.get("workout") + " " + r.get("created_at");
    }

    /** one line per day, its meals as a signature (slot, name, kcal) */
    private static Map<String, Map<String, Object>> byDay(List<Map<String, Object>> meals) {
        Map<String, List<String>> days = new HashMap<>();
        for (Map<String, Object> m : meals) {
            Object kcal = m.get("kcal");
            days.computeIfAbsent(str(m.get("day")), k -> new ArrayList<>())
                    .add(m.get("slot") + ":" + m.get("name") + ":" + (kcal instanceof Number n ? Math.round(n.doubleValue()) : kcal));
        }
        Map<String, Map<String, Object>> out = new HashMap<>();
        days.forEach((day, sig) -> {
            sig.sort(String::compareTo);
            out.put(day, Map.of("sig", String.join("|", sig)));
        });
        return out;
    }

    private static Change compare(Map<String, Map<String, Object>> current, Map<String, Map<String, Object>> backup,
            java.util.function.Function<Map<String, Object>, String> content) {
        int added = 0;
        int changed = 0;
        int same = 0;
        List<String> examples = new ArrayList<>();
        for (var e : backup.entrySet()) {
            Map<String, Object> now = current.get(e.getKey());
            if (now == null) {
                added++;
                if (examples.size() < 4) {
                    examples.add("+ " + e.getKey());
                }
            } else if (!normalize(content.apply(now)).equals(normalize(content.apply(e.getValue())))) {
                changed++;
                if (examples.size() < 4) {
                    examples.add("~ " + e.getKey());
                }
            } else {
                same++;
            }
        }
        int removed = 0;
        for (String k : current.keySet()) {
            if (!backup.containsKey(k)) {
                removed++;
                if (examples.size() < 6) {
                    examples.add("− " + k);
                }
            }
        }
        return new Change(added, changed, removed, same, examples);
    }

    /** 70 and 70.0 are the same value */
    private static String normalize(String s) {
        return s.replaceAll("(\\d)\\.0(\\D|$)", "$1$2");
    }

    private static Map<String, Map<String, Object>> keyed(List<Map<String, Object>> rows,
            java.util.function.Function<Map<String, Object>, String> key) {
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            out.putIfAbsent(key.apply(r), r);
        }
        return out;
    }

    // ── restore ──────────────────────────────────────────────────────────────

    public Result restore(UUID userId, String token, Mode mode) {
        String key = jdbc.queryForList("select storage_key from restore_upload where token = ? and user_id = ? and created_at > ?",
                String.class, token, userId, Timestamp.from(Instant.now().minus(PREVIEW_LIFE))).stream().findFirst()
                .orElseThrow(() -> ApiException.badRequest("restore_expired"));
        Path file = null;
        try {
            file = Files.createTempFile("restore-", ".zip");
            if (!storage.getToFile(key, file)) {
                throw ApiException.badRequest("restore_expired");
            }
            Parsed parsed = parse(file);
            long freed = mode == Mode.REPLACE ? quota.usedBytes(userId) : 0;
            quota.check(userId, parsed.filesBytes(), freed);
            Path zipPath = file;
            Result result;
            try {
                result = tx.execute(s -> apply(userId, parsed, zipPath, mode));
            } catch (org.springframework.dao.DataAccessException e) {
                // a value the database refuses (a hand-edited file…): nothing was written
                log.info("Restore refused by the database: {}", e.getMostSpecificCause().getMessage());
                throw ApiException.badRequest("backup_invalid");
            }
            storage.delete(key);
            jdbc.update("delete from restore_upload where token = ?", token);
            return result;
        } catch (IOException e) {
            throw ApiException.badRequest("backup_invalid");
        } finally {
            if (file != null) {
                try {
                    Files.deleteIfExists(file);
                } catch (IOException ignored) {
                    // temp file
                }
            }
        }
    }

    private Result apply(UUID userId, Parsed p, Path zipPath, Mode mode) {
        // what is really decompressed, whatever the headers claim (a zip bomb stops here)
        long[] inflated = {0};
        List<String> obsolete = new ArrayList<>();
        List<String> written = new ArrayList<>();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                for (String k : status == STATUS_COMMITTED ? obsolete : written) {
                    try {
                        storage.delete(k);
                    } catch (RuntimeException e) {
                        log.warn("Could not delete {} after a restore", k);
                    }
                }
            }
        });
        String prefix = ObjectStorage.userPrefix(userId);
        if (mode == Mode.REPLACE) {
            for (Map<String, Object> r : jdbc.queryForList("select id, format from photo where user_id = ?", userId)) {
                obsolete.add(prefix + "p/" + r.get("id") + "." + r.get("format"));
                obsolete.add(prefix + "p/" + r.get("id") + "_t." + r.get("format"));
            }
            for (Map<String, Object> r : jdbc.queryForList("select id, image_format, image_version from recipe where owner_id = ? and image_format is not null", userId)) {
                obsolete.add(prefix + "r/" + r.get("id") + "_" + r.get("image_version") + "." + r.get("image_format"));
                obsolete.add(prefix + "r/" + r.get("id") + "_" + r.get("image_version") + "_t." + r.get("image_format"));
            }
            jdbc.update("delete from meal_entry where user_id = ?", userId);
            jdbc.update("delete from recipe where owner_id = ?", userId);
            jdbc.update("delete from food where source = 'USER' and owner_id = ?", userId);
            jdbc.update("delete from photo where user_id = ?", userId);
            jdbc.update("delete from workout_session where user_id = ?", userId);
            jdbc.update("delete from body_log where user_id = ?", userId);
            jdbc.update("delete from water_log where user_id = ?", userId);
            jdbc.update("delete from bp_log where user_id = ?", userId);
            jdbc.update("delete from medication where user_id = ?", userId);
            jdbc.update("delete from timer_preset where user_id = ?", userId);
            jdbc.update("delete from weight_milestone where user_id = ?", userId);
        }
        try (ZipFile zip = new ZipFile(zipPath.toFile())) {
            Map<String, UUID> foodIds = new HashMap<>();
            Map<String, UUID> recipeIds = new HashMap<>();
            int foods = 0;
            for (Map<String, Object> f : list(p.data(), "foods")) {
                Map<String, Object> v = typed(BackupFormat.FOODS, f);
                if (v.get("name") == null || v.get("kcal") == null) {
                    continue;
                }
                v.putIfAbsent("nutriscore_estimated", false);
                if (v.get("nutriscore_estimated") == null) {
                    v.put("nutriscore_estimated", false);
                }
                UUID existing = mode == Mode.MERGE ? jdbc.queryForList(
                        "select id from food where source = 'USER' and owner_id = ? and lower(name) = lower(?) limit 1", UUID.class, userId,
                        v.get("name")).stream().findFirst().orElse(null) : null;
                UUID id = existing != null ? existing : UUID.randomUUID();
                if (existing != null) {
                    jdbc.update("delete from food where id = ?", existing);
                }
                insert("food", v, Map.of("id", id, "source", "USER", "owner_id", userId, "search_name",
                        fr.mbonnici.mybody365.nutrition.SearchText.normalize(v.get("name") + " " + (v.get("brand") == null ? "" : v.get("brand")))));
                foodIds.put(str(f.get("id")), id);
                foods++;
            }
            int recipes = 0;
            for (Map<String, Object> r : list(p.data(), "recipes")) {
                Map<String, Object> v = typed(BackupFormat.RECIPES, r);
                if (v.get("name") == null || v.get("type") == null || v.get("servings") == null) {
                    continue;
                }
                // 1.13: a backup made before has no alcohol flag
                if (v.get("alcohol") == null) {
                    v.put("alcohol", false);
                }
                // its types (1.7): only the known ones, the main one at least; a backup made before has none
                Object ts = v.get("types");
                String known = ts == null ? "" : java.util.Arrays.stream(ts.toString().split(",")).map(String::strip)
                        .filter(t -> java.util.Arrays.stream(fr.mbonnici.mybody365.recipe.RecipeService.Type.values()).anyMatch(x -> x.name().equals(t)))
                        .distinct().collect(java.util.stream.Collectors.joining(","));
                v.put("types", known.isEmpty() ? v.get("type") : known);
                if (v.get("kcal") == null) {
                    v.put("kcal", 0d);
                }
                // a backup made before 0.8 has no visibility: the community when it was shared; anything else stays private
                Object vis = v.get("visibility");
                if (!"FRIENDS".equals(vis) && !"PUBLIC".equals(vis)) {
                    vis = Boolean.TRUE.equals(v.get("shared")) && vis == null ? "PUBLIC" : "PRIVATE";
                }
                // the community is published by the admins (1.7): a member's recipe comes back to their friends
                if ("PUBLIC".equals(vis) && !admin(userId)) {
                    vis = "FRIENDS";
                }
                v.put("visibility", vis);
                if (v.get("manual_nutrition") == null) {
                    v.put("manual_nutrition", false);
                }
                Object src = v.get("source_url");
                if (src != null && !(src.toString().startsWith("https://") || src.toString().startsWith("http://")) || (src != null && src.toString().length() > 500)) {
                    v.put("source_url", null);
                }
                // 1.11: the credit of a free photo, as short as the columns, its page an address
                for (String[] c : new String[][] {{"image_credit", "200"}, {"image_license", "60"}, {"image_source", "500"}}) {
                    Object t = v.get(c[0]);
                    if (t != null && t.toString().length() > Integer.parseInt(c[1])) {
                        v.put(c[0], t.toString().substring(0, Integer.parseInt(c[1])));
                    }
                }
                Object page = v.get("image_source");
                if (page != null && !page.toString().startsWith("https://")) {
                    v.put("image_source", null);
                }
                v.put("shared", "PUBLIC".equals(vis));
                if (mode == Mode.MERGE) {
                    for (Map<String, Object> old : jdbc.queryForList(
                            "select id, image_format, image_version from recipe where owner_id = ? and lower(name) = lower(?)", userId, v.get("name"))) {
                        if (old.get("image_format") != null) {
                            obsolete.add(prefix + "r/" + old.get("id") + "_" + old.get("image_version") + "." + old.get("image_format"));
                            obsolete.add(prefix + "r/" + old.get("id") + "_" + old.get("image_version") + "_t." + old.get("image_format"));
                        }
                        jdbc.update("delete from recipe where id = ?", old.get("id"));
                    }
                }
                UUID id = UUID.randomUUID();
                String oldId = str(r.get("id"));
                String fmt = (String) v.get("image_format");
                Long imageBytes = null;
                if (fmt != null) {
                    String full = "recipes/" + oldId + "." + fmt;
                    String thumb = "recipes/" + oldId + "_t." + fmt;
                    if (p.files().contains(full) && p.files().contains(thumb)) {
                        imageBytes = put(zip, full, prefix + "r/" + id + "_1." + fmt, fmt, written, inflated)
                                + put(zip, thumb, prefix + "r/" + id + "_1_t." + fmt, fmt, written, inflated);
                    } else {
                        v.put("image_format", null);
                    }
                }
                Map<String, Object> extra = new HashMap<>();
                extra.put("id", id);
                extra.put("owner_id", userId);
                extra.put("image_version", imageBytes == null ? 0 : 1);
                if (imageBytes != null) {
                    extra.put("image_bytes", imageBytes);
                }
                v.put("shared", false);
                insert("recipe", v, extra);
                recipeIds.put(oldId, id);
                Object ings = r.get("ingredients");
                if (ings instanceof List<?> l) {
                    for (Object o : l) {
                        if (o instanceof Map<?, ?> m) {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> iv = typed(BackupFormat.INGREDIENTS, (Map<String, Object>) m);
                            if (iv.get("name") == null || iv.get("grams") == null || iv.get("kcal") == null) {
                                continue;
                            }
                            iv.put("recipe_id", id);
                            iv.put("food_id", mapFood(iv.get("food_id"), foodIds, userId));
                            insert("recipe_ingredient", iv, Map.of("id", UUID.randomUUID()));
                        }
                    }
                }
                recipes++;
            }
            int photos = 0;
            for (Map<String, Object> ph : list(p.data(), "photos")) {
                Map<String, Object> v = typed(BackupFormat.PHOTOS, ph);
                String fmt = (String) v.get("format");
                if (v.get("day") == null || v.get("pose") == null || fmt == null || v.get("width") == null || v.get("height") == null) {
                    continue;
                }
                String oldId = str(ph.get("id"));
                String full = "photos/" + oldId + "." + fmt;
                String thumb = "photos/" + oldId + "_t." + fmt;
                if (!p.files().contains(full) || !p.files().contains(thumb)) {
                    continue;
                }
                if (mode == Mode.MERGE) {
                    for (Map<String, Object> old : jdbc.queryForList("select id, format from photo where user_id = ? and day = ? and pose = ?",
                            userId, v.get("day"), v.get("pose"))) {
                        obsolete.add(prefix + "p/" + old.get("id") + "." + old.get("format"));
                        obsolete.add(prefix + "p/" + old.get("id") + "_t." + old.get("format"));
                        jdbc.update("delete from photo where id = ?", old.get("id"));
                    }
                }
                UUID id = UUID.randomUUID();
                long bytes = put(zip, full, prefix + "p/" + id + "." + fmt, fmt, written, inflated);
                long thumbBytes = put(zip, thumb, prefix + "p/" + id + "_t." + fmt, fmt, written, inflated);
                insert("photo", v, Map.of("id", id, "user_id", userId, "bytes", bytes, "thumb_bytes", thumbBytes));
                photos++;
            }
            int logs = 0;
            for (Map<String, Object> l : list(p.data(), "logs")) {
                Map<String, Object> v = typed(BackupFormat.LOGS, l);
                if (v.get("day") == null) {
                    continue;
                }
                jdbc.update("delete from body_log where user_id = ? and day = ?", userId, v.get("day"));
                insert("body_log", v, Map.of("user_id", userId));
                logs++;
            }
            int meals = 0;
            Set<Object> mealDays = new HashSet<>();
            for (Map<String, Object> m : list(p.data(), "meals")) {
                Map<String, Object> v = typed(BackupFormat.MEALS, m);
                if (v.get("day") == null || v.get("slot") == null || v.get("name") == null || v.get("kcal") == null
                        || (v.get("grams") == null && v.get("servings") == null)) {
                    continue;
                }
                if (mode == Mode.MERGE && mealDays.add(v.get("day"))) {
                    jdbc.update("delete from meal_entry where user_id = ? and day = ?", userId, v.get("day"));
                }
                v.put("food_id", mapFood(v.get("food_id"), foodIds, userId));
                Object recipe = v.get("recipe_id");
                v.put("recipe_id", recipe == null ? null : recipeIds.get(recipe.toString()));
                if (v.get("created_at") == null) {
                    v.put("created_at", Timestamp.from(Instant.now()));
                }
                // 1.13: a backup made before has neither the health score nor the millilitres; a score is out of 10
                if (v.get("liquid") == null) {
                    v.put("liquid", false);
                }
                if (v.get("health") instanceof Number h && (h.doubleValue() < 0 || h.doubleValue() > 10)) {
                    v.put("health", null);
                }
                insert("meal_entry", v, Map.of("id", UUID.randomUUID(), "user_id", userId));
                meals++;
            }
            int workouts = 0;
            for (Map<String, Object> w : list(p.data(), "workouts")) {
                Map<String, Object> v = typed(BackupFormat.WORKOUTS, w);
                if (v.get("day") == null || v.get("program") == null || v.get("workout") == null || v.get("exercises") == null) {
                    continue;
                }
                if (v.get("created_at") == null) {
                    v.put("created_at", Timestamp.from(Instant.now()));
                }
                boolean exists = !jdbc.queryForList(
                        "select 1 from workout_session where user_id = ? and day = ? and program = ? and workout = ? and created_at = ?",
                        Integer.class, userId, v.get("day"), v.get("program"), v.get("workout"), v.get("created_at")).isEmpty();
                if (!exists) {
                    insert("workout_session", v, Map.of("id", UUID.randomUUID(), "user_id", userId));
                    workouts++;
                }
            }
            // glasses of water: a backup made before 0.8 has none
            int water = 0;
            for (Map<String, Object> w : list(p.data(), "water")) {
                Map<String, Object> v = typed(BackupFormat.WATER, w);
                Object g = v.get("glasses");
                if (v.get("day") == null || !(g instanceof Number n) || n.intValue() < 1 || n.intValue() > 40) {
                    continue;
                }
                jdbc.update("delete from water_log where user_id = ? and day = ?", userId, v.get("day"));
                insert("water_log", v, Map.of("user_id", userId));
                water++;
            }
            // 1.17: the blood pressure, the same day and moment replaced; a backup made before has none
            int bloodPressure = 0;
            for (Map<String, Object> w : list(p.data(), "bp")) {
                Map<String, Object> v = typed(BackupFormat.BP, w);
                Object moment = v.get("moment");
                if (v.get("day") == null || !("MORNING".equals(moment) || "EVENING".equals(moment)) || !(v.get("systolic") instanceof Number s)
                        || !(v.get("diastolic") instanceof Number d) || s.intValue() < 60 || s.intValue() > 260 || d.intValue() < 30
                        || d.intValue() > 160 || s.intValue() <= d.intValue()) {
                    continue;
                }
                if (!(v.get("pulse") instanceof Number pl) || pl.intValue() < 30 || pl.intValue() > 220) {
                    v.put("pulse", null);
                }
                if (!(v.get("readings") instanceof Number rd) || rd.intValue() < 1 || rd.intValue() > 3) {
                    v.put("readings", 1);
                }
                jdbc.update("delete from bp_log where user_id = ? and day = ? and moment = ?", userId, v.get("day"), moment);
                insert("bp_log", v, Map.of("user_id", userId));
                bloodPressure++;
            }
            // 1.17: the treatments of the pill box, the same name replaced (20 at most)
            int medications = 0;
            for (Map<String, Object> w : list(p.data(), "medications")) {
                Map<String, Object> v = typed(BackupFormat.MEDICATIONS, w);
                if (!(v.get("name") instanceof String name) || name.isBlank() || name.length() > 60 || !(v.get("times") instanceof String times)
                        || !times.matches("([01]\\d|2[0-3]):[0-5]\\d(,([01]\\d|2[0-3]):[0-5]\\d){0,5}") || !(v.get("days") instanceof String days)
                        || !days.matches("[1-7](,[1-7]){0,6}")) {
                    continue;
                }
                if (v.get("dose") instanceof String dose && dose.length() > 40) {
                    v.put("dose", dose.substring(0, 40));
                }
                if (v.get("reminders") == null) {
                    v.put("reminders", true);
                }
                jdbc.update("delete from medication where user_id = ? and lower(name) = lower(?)", userId, name);
                Integer count = jdbc.queryForObject("select count(*) from medication where user_id = ?", Integer.class, userId);
                if (count != null && count >= 20) {
                    continue;
                }
                insert("medication", v, Map.of("id", UUID.randomUUID(), "user_id", userId));
                medications++;
            }
            // saved timers: same name, same timer (20 at most)
            int timers = 0;
            for (Map<String, Object> w : list(p.data(), "timers")) {
                Map<String, Object> v = typed(BackupFormat.TIMERS, w);
                Object name = v.get("name");
                if (!(name instanceof String s) || s.isBlank() || s.length() > 30 || !(v.get("work_s") instanceof Number work)
                        || !(v.get("rest_s") instanceof Number rest) || !(v.get("rounds") instanceof Number rounds)
                        || work.intValue() < 5 || work.intValue() > 3600 || rest.intValue() < 0 || rest.intValue() > 600
                        || rounds.intValue() < 1 || rounds.intValue() > 30) {
                    continue;
                }
                jdbc.update("delete from timer_preset where user_id = ? and lower(name) = lower(?)", userId, s);
                Integer count = jdbc.queryForObject("select count(*) from timer_preset where user_id = ?", Integer.class, userId);
                if (count != null && count >= 20) {
                    continue;
                }
                if (v.get("created_at") == null) {
                    v.put("created_at", Timestamp.from(Instant.now()));
                }
                insert("timer_preset", v, Map.of("id", UUID.randomUUID(), "user_id", userId));
                timers++;
            }
            // milestones (1.8): the same weight replaced, ten at most; a backup made before has none
            int milestones = 0;
            for (Map<String, Object> w : list(p.data(), "milestones")) {
                Map<String, Object> v = typed(BackupFormat.MILESTONES, w);
                if (!(v.get("target_kg") instanceof Number t) || t.doubleValue() < 30 || t.doubleValue() > 300) {
                    continue;
                }
                double kg = Math.round(t.doubleValue() * 10) / 10.0;
                v.put("target_kg", java.math.BigDecimal.valueOf(kg));
                Object reward = v.get("reward");
                v.put("reward", reward instanceof String r && !r.isBlank() ? (r.length() > 80 ? r.substring(0, 80) : r.strip()) : null);
                jdbc.update("delete from weight_milestone where user_id = ? and target_kg = ?", userId, v.get("target_kg"));
                Integer count = jdbc.queryForObject("select count(*) from weight_milestone where user_id = ?", Integer.class, userId);
                if (count != null && count >= 10) {
                    continue;
                }
                insert("weight_milestone", v, Map.of("id", UUID.randomUUID(), "user_id", userId));
                milestones++;
            }
            Object profile = p.data().get("profile");
            if (profile instanceof Map<?, ?> pm) {
                @SuppressWarnings("unchecked")
                Map<String, Object> v = typed(BackupFormat.PROFILE, (Map<String, Object>) pm);
                profileOptions(v);
                if (!v.containsValue(null)) {
                    jdbc.update("delete from body_profile where user_id = ?", userId);
                    insert("body_profile", v, Map.of("user_id", userId));
                }
            }
            Object prefs = p.data().get("notifications");
            if (prefs instanceof Map<?, ?> nm) {
                @SuppressWarnings("unchecked")
                Map<String, Object> v = typed(BackupFormat.PREFS, (Map<String, Object>) nm);
                for (String later : BackupFormat.PREFS_SINCE_1_1) {
                    if (v.get(later) == null) {
                        v.remove(later);
                    }
                }
                if (!v.containsValue(null)) {
                    jdbc.update("delete from notification_pref where user_id = ?", userId);
                    insert("notification_pref", v, Map.of("user_id", userId));
                }
            }
            return new Result(logs, photos, meals, foods, recipes, workouts, water, timers, milestones, bloodPressure, medications);
        } catch (IOException e) {
            throw ApiException.badRequest("backup_invalid");
        }
    }

    /** an id of one of the restored foods, a shared food still there, or nothing */
    private UUID mapFood(Object oldId, Map<String, UUID> foodIds, UUID userId) {
        if (oldId == null) {
            return null;
        }
        UUID mapped = foodIds.get(oldId.toString());
        if (mapped != null) {
            return mapped;
        }
        return jdbc.queryForList("select id from food where id = ? and (source <> 'USER' or owner_id = ?)", UUID.class, oldId, userId).stream()
                .findFirst().orElse(null);
    }

    /** a picture from the zip to the storage (read with a hard size limit) */
    private long put(ZipFile zip, String entry, String key, String fmt, List<String> written, long[] inflated) throws IOException {
        byte[] bytes = read(zip, entry);
        inflated[0] += bytes.length;
        if (inflated[0] > MAX_TOTAL) {
            throw ApiException.badRequest("backup_invalid");
        }
        storage.put(key, bytes, "webp".equals(fmt) ? "image/webp" : "image/jpeg");
        written.add(key);
        return bytes.length;
    }

    /**
     * The answers of 1.7 (job, sessions, split), checked against what the database accepts; absent from an
     * older backup, or wrong, they are left out (the level of activity counts, the split is balanced).
     */
    private static void profileOptions(Map<String, Object> v) {
        Object job = v.get("job");
        Object sessions = v.get("sessions_per_week");
        boolean answers = job != null && java.util.Set.of("SEATED", "STANDING", "PHYSICAL").contains(job.toString())
                && sessions instanceof Number n && n.intValue() >= 0 && n.intValue() <= 14;
        if (!answers) {
            v.remove("job");
            v.remove("sessions_per_week");
        }
        Object split = v.get("macro_split");
        if (split == null || !java.util.Set.of("BALANCED", "PROTEIN", "LOW_CARB").contains(split.toString())) {
            v.remove("macro_split");
        }
        for (String k : BackupFormat.PROFILE_OPTIONAL) {
            if (v.containsKey(k) && v.get(k) == null) {
                v.remove(k);
            }
        }
    }

    private static Map<String, Object> typed(Table t, Map<String, Object> raw) {
        Map<String, Object> v = new LinkedHashMap<>();
        for (Map.Entry<String, Type> c : t.columns().entrySet()) {
            v.put(c.getKey(), BackupFormat.fromJson(raw.get(c.getKey()), c.getValue()));
        }
        // enumerations stay within what the database accepts
        Object up = v.get("slot");
        if (up != null) {
            v.put("slot", up.toString().toUpperCase(Locale.ROOT));
        }
        return v;
    }

    /** an insert over known column names only, every value a parameter */
    private void insert(String table, Map<String, Object> values, Map<String, Object> extra) {
        Map<String, Object> all = new LinkedHashMap<>(values);
        all.putAll(extra);
        String cols = String.join(", ", all.keySet());
        String marks = String.join(", ", all.keySet().stream().map(k -> "?").toList());
        jdbc.update("insert into " + table + " (" + cols + ") values (" + marks + ")", all.values().toArray());
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> data, String key) {
        Object v = data.get(key);
        if (!(v instanceof List<?> l)) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object o : l) {
            if (o instanceof Map<?, ?> m) {
                out.add((Map<String, Object>) m);
            }
        }
        return out;
    }

    private static String str(Object v) {
        return v == null ? null : v.toString();
    }

    private static String lower(Object v) {
        return v == null ? "" : v.toString().toLowerCase(Locale.ROOT);
    }

    /** previews never confirmed: gone after an hour */
    @Scheduled(fixedDelay = 15 * 60 * 1000L)
    public void cleanup() {
        for (Map<String, Object> r : jdbc.queryForList("select token, storage_key from restore_upload where created_at < ?",
                Timestamp.from(Instant.now().minus(PREVIEW_LIFE)))) {
            try {
                storage.delete((String) r.get("storage_key"));
            } catch (RuntimeException e) {
                log.warn("Could not delete an old backup upload");
            }
            jdbc.update("delete from restore_upload where token = ?", r.get("token"));
        }
    }
}
