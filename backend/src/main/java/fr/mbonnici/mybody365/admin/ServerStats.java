package fr.mbonnici.mybody365.admin;

import com.sun.management.OperatingSystemMXBean;
import fr.mbonnici.mybody365.config.AppProperties;
import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 1.13: what the project takes on the server, for the admin's « Statistiques »: the storage (the database, the photos and
 * pictures, the disk), the memory and the processor of the app (its container) and of the photo storage, and the
 * machine's own. Measured every minute, the last 24 hours kept in memory (they start again with the app).
 *
 * <p>What a container may read of its machine: its own cgroup (memory, processor time), and the machine's /proc/meminfo,
 * /proc/stat and the disk under it. The photo storage (SeaweedFS) gives its memory and processor time on its metrics
 * port, and its volumes on its status page; the database its size. The database's memory cannot be read from here.
 */
@Service
public class ServerStats {

    private static final Logger log = LoggerFactory.getLogger(ServerStats.class);
    private static final int KEEP = 24 * 60;

    /** one minute of the server: processor in % of the machine, memory in bytes (null: not readable here) */
    public record Sample(Instant at, Double hostCpu, Long hostMemUsed, Double appCpu, Long appMem, Double storageCpu, Long storageMem) {}

    public record Part(String key, long bytes) {}

    public record StatsDto(Instant at, Instant since,
            /** the machine: processors, memory, its disk */
            Integer cpus, Double hostCpu, Long hostMemTotal, Long hostMemUsed, Long diskTotal, Long diskUsed,
            /** the app: its memory (the container's, else the Java process's), its processor, Java's heap */
            Long appMem, Long appMemLimit, Double appCpu, Long heapUsed, Long heapMax, Long uptimeSeconds, Integer threads,
            /** the photo storage: its memory, its processor, what its volumes take on the disk, its files */
            Long storageMem, Double storageCpu, Long storageBytes, Long storageFiles,
            /** the database: its size, its connections, its biggest tables */
            Long databaseBytes, Integer connections, List<Part> tables,
            /** what the members keep: photos, recipe pictures, profile pictures (bytes) */
            List<Part> files,
            /** a few counts of the app */
            Map<String, Long> counts, List<Sample> history) {}

    private final JdbcTemplate jdbc;
    private final AppProperties props;
    private final JsonMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    private final Deque<Sample> samples = new ArrayDeque<>();
    private final Instant started = Instant.now();

    private long[] lastHostCpu;
    private Long lastAppCpuNanos;
    private Double lastStorageCpuSeconds;
    private long lastAt;

    public ServerStats(JdbcTemplate jdbc, AppProperties props, JsonMapper json) {
        this.jdbc = jdbc;
        this.props = props;
        this.json = json;
        // a first reading, so that the first sample (5 seconds later) already has a processor time to compare with
        try {
            hostCpu();
            lastAppCpuNanos = appCpuNanos();
            lastAt = System.nanoTime();
        } catch (RuntimeException e) {
            // read again at the first sample
        }
    }

    @Scheduled(initialDelay = 5_000, fixedDelay = 60_000)
    public synchronized void sample() {
        try {
            long now = System.nanoTime();
            double elapsed = lastAt == 0 ? 0 : (now - lastAt) / 1e9;
            lastAt = now;
            Double hostCpu = hostCpu();
            Long appNanos = appCpuNanos();
            Double appCpu = null;
            int cpus = cpus();
            if (appNanos != null && lastAppCpuNanos != null && elapsed > 0) {
                appCpu = round(100.0 * (appNanos - lastAppCpuNanos) / 1e9 / elapsed / cpus);
            }
            lastAppCpuNanos = appNanos;
            Double storageCpu = null;
            Long storageMem = null;
            Map<String, Double> m = storageMetrics();
            if (m != null) {
                Double secs = m.get("process_cpu_seconds_total");
                Double rss = m.get("process_resident_memory_bytes");
                storageMem = rss == null ? null : rss.longValue();
                if (secs != null && lastStorageCpuSeconds != null && elapsed > 0) {
                    storageCpu = round(100.0 * (secs - lastStorageCpuSeconds) / elapsed / cpus);
                }
                lastStorageCpuSeconds = secs;
            }
            long[] mem = hostMemory();
            samples.addLast(new Sample(Instant.now(), hostCpu, mem == null ? null : mem[0] - mem[1], appCpu, appMemory(), storageCpu, storageMem));
            while (samples.size() > KEEP) {
                samples.removeFirst();
            }
        } catch (RuntimeException e) {
            log.debug("Server sample failed", e);
        }
    }

    public synchronized StatsDto stats() {
        Sample last = samples.peekLast();
        long[] mem = hostMemory();
        Long diskTotal = null;
        Long diskUsed = null;
        try {
            FileStore store = Files.getFileStore(Path.of("/"));
            diskTotal = store.getTotalSpace();
            diskUsed = store.getTotalSpace() - store.getUsableSpace();
        } catch (IOException | RuntimeException e) {
            // no disk to read
        }
        Runtime rt = Runtime.getRuntime();
        long[] volumes = storageVolumes();
        Long dbBytes = jdbc.queryForObject("select pg_database_size(current_database())", Long.class);
        Integer connections = jdbc.queryForObject("select count(*)::int from pg_stat_activity where datname = current_database()", Integer.class);
        List<Part> tables = jdbc.query("""
                select c.relname, pg_total_relation_size(c.oid) bytes from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where c.relkind = 'r' and n.nspname = 'public' order by 2 desc limit 6""", (rs, i) -> new Part(rs.getString(1), rs.getLong(2)));
        Map<String, Object> f = jdbc.queryForMap("""
                select (select coalesce(sum(bytes + thumb_bytes), 0) from photo) photos,
                       (select coalesce(sum(image_bytes), 0) from recipe where image_bytes is not null) recipes,
                       (select coalesce(sum(avatar_bytes), 0) from app_user where avatar_bytes is not null) avatars""");
        List<Part> files = List.of(new Part("photos", ((Number) f.get("photos")).longValue()), new Part("recipes", ((Number) f.get("recipes")).longValue()),
                new Part("avatars", ((Number) f.get("avatars")).longValue()));
        Map<String, Object> c = jdbc.queryForMap("""
                select (select count(*) from app_user) users, (select count(*) from meal_entry) meals, (select count(*) from photo) photos,
                       (select count(*) from recipe) recipes, (select count(*) from food where source = 'OFF') products,
                       (select count(*) from body_log) weighins""");
        Map<String, Long> counts = new java.util.LinkedHashMap<>();
        c.forEach((k, v) -> counts.put(k, ((Number) v).longValue()));
        java.lang.management.ThreadMXBean threads = ManagementFactory.getThreadMXBean();
        return new StatsDto(Instant.now(), started, cpus(), last == null ? hostCpu() : last.hostCpu(), mem == null ? null : mem[0],
                mem == null ? null : mem[0] - mem[1], diskTotal, diskUsed, appMemory(), appMemoryLimit(), last == null ? null : last.appCpu(),
                rt.totalMemory() - rt.freeMemory(), rt.maxMemory(), ManagementFactory.getRuntimeMXBean().getUptime() / 1000,
                threads.getThreadCount(), last == null ? null : last.storageMem(), last == null ? null : last.storageCpu(),
                volumes == null ? null : volumes[0], volumes == null ? null : volumes[1], dbBytes, connections, tables, files, counts,
                history());
    }

    /** the last 24 hours, one point every 5 minutes (the mean of its minutes) */
    private List<Sample> history() {
        List<Sample> out = new ArrayList<>();
        List<Sample> all = new ArrayList<>(samples);
        for (int i = 0; i < all.size(); i += 5) {
            List<Sample> group = all.subList(i, Math.min(all.size(), i + 5));
            out.add(new Sample(group.getLast().at(), meanD(group.stream().map(Sample::hostCpu).toList()),
                    meanL(group.stream().map(Sample::hostMemUsed).toList()), meanD(group.stream().map(Sample::appCpu).toList()),
                    meanL(group.stream().map(Sample::appMem).toList()), meanD(group.stream().map(Sample::storageCpu).toList()),
                    meanL(group.stream().map(Sample::storageMem).toList())));
        }
        return out;
    }

    private static Double meanD(List<Double> v) {
        List<Double> known = v.stream().filter(java.util.Objects::nonNull).toList();
        return known.isEmpty() ? null : round(known.stream().mapToDouble(Double::doubleValue).average().orElse(0));
    }

    private static Long meanL(List<Long> v) {
        List<Long> known = v.stream().filter(java.util.Objects::nonNull).toList();
        return known.isEmpty() ? null : Math.round(known.stream().mapToLong(Long::longValue).average().orElse(0));
    }

    private static double round(double v) {
        return Math.round(Math.max(0, v) * 10) / 10.0;
    }

    private static int cpus() {
        try {
            long n = Files.readAllLines(Path.of("/proc/cpuinfo")).stream().filter(l -> l.startsWith("processor")).count();
            if (n > 0) {
                return (int) n;
            }
        } catch (IOException | RuntimeException e) {
            // not Linux
        }
        return Runtime.getRuntime().availableProcessors();
    }

    /** the machine's processor in %, from /proc/stat between two minutes (else the JVM's view) */
    private Double hostCpu() {
        try {
            String line = Files.readAllLines(Path.of("/proc/stat")).getFirst();
            String[] p = line.trim().split("\\s+");
            long idle = Long.parseLong(p[4]) + (p.length > 5 ? Long.parseLong(p[5]) : 0);
            long total = 0;
            for (int i = 1; i < Math.min(p.length, 9); i++) {
                total += Long.parseLong(p[i]);
            }
            long[] before = lastHostCpu;
            lastHostCpu = new long[] {idle, total};
            if (before == null || total <= before[1]) {
                return null;
            }
            return round(100.0 * (1 - (double) (idle - before[0]) / (total - before[1])));
        } catch (IOException | RuntimeException e) {
            OperatingSystemMXBean os = (OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
            double load = os.getCpuLoad();
            return load < 0 ? null : round(load * 100);
        }
    }

    /** the machine's memory: total and available, from /proc/meminfo (a container reads the machine's); null elsewhere */
    private static long[] hostMemory() {
        try {
            long total = -1;
            long available = -1;
            for (String l : Files.readAllLines(Path.of("/proc/meminfo"))) {
                if (l.startsWith("MemTotal:")) {
                    total = kb(l);
                } else if (l.startsWith("MemAvailable:")) {
                    available = kb(l);
                }
            }
            return total > 0 && available >= 0 ? new long[] {total, available} : null;
        } catch (IOException | RuntimeException e) {
            OperatingSystemMXBean os = (OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
            return new long[] {os.getTotalMemorySize(), os.getFreeMemorySize()};
        }
    }

    private static long kb(String line) {
        return Long.parseLong(line.replaceAll("[^0-9]", "")) * 1024;
    }

    /** the container's memory (cgroup v2, then v1), else the Java process's resident memory */
    private static Long appMemory() {
        Long v = readLong("/sys/fs/cgroup/memory.current");
        if (v == null) {
            v = readLong("/sys/fs/cgroup/memory/memory.usage_in_bytes");
        }
        if (v != null) {
            // the page cache the kernel can take back is not the app's
            Long inactive = statValue("/sys/fs/cgroup/memory.stat", "inactive_file");
            return inactive != null && inactive < v ? v - inactive : v;
        }
        try {
            for (String l : Files.readAllLines(Path.of("/proc/self/status"))) {
                if (l.startsWith("VmRSS:")) {
                    return kb(l);
                }
            }
        } catch (IOException | RuntimeException e) {
            // not Linux
        }
        Runtime rt = Runtime.getRuntime();
        return rt.totalMemory() - rt.freeMemory();
    }

    private static Long appMemoryLimit() {
        try {
            String max = Files.readString(Path.of("/sys/fs/cgroup/memory.max")).strip();
            if (!max.equals("max")) {
                return Long.parseLong(max);
            }
        } catch (IOException | RuntimeException e) {
            // no limit to read
        }
        return null;
    }

    /** the container's processor time (cgroup v2 usage_usec, v1 cpuacct.usage), else the JVM's */
    private static Long appCpuNanos() {
        Long usec = statValue("/sys/fs/cgroup/cpu.stat", "usage_usec");
        if (usec != null) {
            return usec * 1000;
        }
        Long v1 = readLong("/sys/fs/cgroup/cpuacct/cpuacct.usage");
        if (v1 != null) {
            return v1;
        }
        OperatingSystemMXBean os = (OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
        long t = os.getProcessCpuTime();
        return t < 0 ? null : t;
    }

    private static Long readLong(String file) {
        try {
            return Long.parseLong(Files.readString(Path.of(file)).strip());
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    private static Long statValue(String file, String key) {
        try {
            for (String l : Files.readAllLines(Path.of(file))) {
                if (l.startsWith(key + " ")) {
                    return Long.parseLong(l.substring(key.length() + 1).strip());
                }
            }
        } catch (IOException | RuntimeException e) {
            // not there
        }
        return null;
    }

    /** the host of the photo storage, from its S3 address (http://storage:8333) */
    private String storageHost() {
        try {
            return URI.create(props.storage().endpoint()).getHost();
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static final Pattern METRIC = Pattern.compile("^(process_cpu_seconds_total|process_resident_memory_bytes)\\s+([0-9.eE+-]+)$",
            Pattern.MULTILINE);

    /** SeaweedFS's metrics (weed server -metricsPort=9327): its resident memory and processor time */
    private Map<String, Double> storageMetrics() {
        String host = storageHost();
        if (host == null) {
            return null;
        }
        try {
            HttpResponse<String> res = http.send(HttpRequest.newBuilder(URI.create("http://" + host + ":9327/metrics")).timeout(Duration.ofSeconds(3))
                    .GET().build(), HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) {
                return null;
            }
            Map<String, Double> out = new java.util.HashMap<>();
            Matcher m = METRIC.matcher(res.body());
            while (m.find()) {
                out.put(m.group(1), Double.parseDouble(m.group(2)));
            }
            return out;
        } catch (IOException | RuntimeException e) {
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    /** what SeaweedFS's volumes take (bytes) and hold (files), from its volume server's status page */
    private long[] storageVolumes() {
        String host = storageHost();
        if (host == null) {
            return null;
        }
        try {
            HttpResponse<String> res = http.send(HttpRequest.newBuilder(URI.create("http://" + host + ":8080/status")).timeout(Duration.ofSeconds(3))
                    .GET().build(), HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) {
                return null;
            }
            JsonNode root = json.readTree(res.body());
            long bytes = 0;
            long files = 0;
            for (JsonNode v : root.path("Volumes")) {
                bytes += v.path("Size").asLong(0);
                files += Math.max(0, v.path("FileCount").asLong(0) - v.path("DeleteCount").asLong(0));
            }
            return new long[] {bytes, files};
        } catch (IOException | RuntimeException e) {
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }
}
