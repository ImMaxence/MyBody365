package fr.mbonnici.mybody365.push;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.config.AppProperties;
import java.net.URI;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.PrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * Notifications on the phones: subscriptions, the app's VAPID keys (made on the first start, kept in the
 * database) and the sending itself. Only the push services of browsers and phones are ever called.
 */
@Service
public class PushService {

    private static final Logger log = LoggerFactory.getLogger(PushService.class);

    /** the push services of Chrome / Android, Firefox, Safari / iOS and Edge / Windows; nothing else */
    private static final List<String> PUSH_HOSTS = List.of("fcm.googleapis.com", "googleapis.com", "push.services.mozilla.com",
            "push.apple.com", "notify.windows.com");

    public enum Kind { TEST, DAILY_WEIGH, DAILY_PHOTO, GYM, NUDGE, FRIEND_REQUEST, FRIEND_ACCEPTED, WATER, UPDATE, FEEDBACK, FRIEND_RECIPE,
        /** a friend shared their progress or their day (FriendPosts), a friend cheered one of mine */
        FRIEND_POST, FRIEND_CHEER,
        /** a friend's challenge to join (Challenges) */
        FRIEND_CHALLENGE,
        /** a change of phase of the workout timer while the app is off screen (TimerAlerts) */
        TIMER,
        /** 1.17: the day of a challenge not done yet (ReminderScheduler) */
        CHALLENGE_REMINDER,
        /** 1.17: the blood pressure of the morning or the evening not measured yet; an intake of the pill box not ticked yet */
        BP_REMINDER, PILL }

    public record Subscription(String endpoint, String p256dh, String auth) {}

    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final AppProperties props;
    private final PushTransport transport;
    private volatile PrivateKey vapidPrivate;
    private volatile String vapidPublic;

    public PushService(JdbcTemplate jdbc, JsonMapper json, AppProperties props, PushTransport transport) {
        this.transport = transport;
        this.jdbc = jdbc;
        this.json = json;
        this.props = props;
    }

    /** the application server key the phones subscribe with (base64url, 65 bytes) */
    public synchronized String publicKey() {
        if (vapidPublic == null) {
            loadKeys();
        }
        return vapidPublic;
    }

    private void loadKeys() {
        try {
            List<Map<String, Object>> rows = jdbc.queryForList("select name, value from app_secret where name in ('vapid_public', 'vapid_private')");
            String pub = null;
            String priv = null;
            for (Map<String, Object> r : rows) {
                if ("vapid_public".equals(r.get("name"))) {
                    pub = (String) r.get("value");
                } else {
                    priv = (String) r.get("value");
                }
            }
            if (pub == null || priv == null) {
                KeyPair kp = WebPushCrypto.newKeyPair();
                pub = WebPushCrypto.b64(WebPushCrypto.rawPublic((ECPublicKey) kp.getPublic()));
                priv = Base64.getEncoder().encodeToString(kp.getPrivate().getEncoded());
                jdbc.update("insert into app_secret (name, value) values ('vapid_public', ?) on conflict (name) do nothing", pub);
                jdbc.update("insert into app_secret (name, value) values ('vapid_private', ?) on conflict (name) do nothing", priv);
                // another instance may have won the race: read back what is stored
                pub = jdbc.queryForObject("select value from app_secret where name = 'vapid_public'", String.class);
                priv = jdbc.queryForObject("select value from app_secret where name = 'vapid_private'", String.class);
                log.info("Generated the Web Push (VAPID) keys");
            }
            vapidPrivate = KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(priv)));
            vapidPublic = pub;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("VAPID keys", e);
        }
    }

    public void subscribe(UUID userId, Subscription s) {
        URI uri;
        try {
            uri = URI.create(s.endpoint());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("push_unsupported");
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        boolean known = PUSH_HOSTS.stream().anyMatch(h -> host.equals(h) || host.endsWith("." + h));
        if (!"https".equals(uri.getScheme()) || !known) {
            throw ApiException.badRequest("push_unsupported");
        }
        try {
            if (WebPushCrypto.unb64(s.auth()).length != 16) {
                throw ApiException.badRequest("push_unsupported");
            }
            WebPushCrypto.publicFromRaw(WebPushCrypto.unb64(s.p256dh()));
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw ApiException.badRequest("push_unsupported");
        }
        jdbc.update("""
                insert into push_subscription (id, user_id, endpoint, p256dh, auth) values (?, ?, ?, ?, ?)
                on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth""",
                UUID.randomUUID(), userId, s.endpoint(), s.p256dh(), s.auth());
        jdbc.update("insert into notification_pref (user_id) values (?) on conflict (user_id) do nothing", userId);
    }

    public void unsubscribe(UUID userId, String endpoint) {
        jdbc.update("delete from push_subscription where user_id = ? and endpoint = ?", userId, endpoint);
    }

    public int devices(UUID userId) {
        Integer n = jdbc.queryForObject("select count(*) from push_subscription where user_id = ?", Integer.class, userId);
        return n == null ? 0 : n;
    }

    /**
     * sends to every device of the account; returns how many accepted it. 1.17: kept in the member's notification centre
     * too (but the workout timer's phases), sent or not (no device, notifications blocked)
     */
    public int notify(UUID userId, Kind kind, Map<String, String> args) {
        String locale = jdbc.queryForList("select locale from app_user where id = ?", String.class, userId).stream().findFirst().orElse("fr");
        Map<String, Object> payload = payload(kind, "en".equals(locale), args);
        if (kind != Kind.TIMER) {
            keepInCentre(userId, kind, payload);
        }
        byte[] body;
        try {
            body = json.writeValueAsBytes(payload);
        } catch (RuntimeException e) {
            throw new IllegalStateException(e);
        }
        List<Map<String, Object>> subs = jdbc.queryForList("select id, endpoint, p256dh, auth from push_subscription where user_id = ?", userId);
        // a timer alert is worth nothing late: delivered at once, or dropped after a minute
        boolean now = kind == Kind.TIMER;
        int ok = 0;
        for (Map<String, Object> s : subs) {
            if (send((UUID) s.get("id"), (String) s.get("endpoint"), (String) s.get("p256dh"), (String) s.get("auth"), body, now)) {
                ok++;
            }
        }
        return ok;
    }

    /** 1.17: a line of the notification centre (what the phone showed, and where a tap leads) */
    @SuppressWarnings("unchecked")
    private void keepInCentre(UUID userId, Kind kind, Map<String, Object> payload) {
        try {
            Map<String, Object> n = (Map<String, Object>) payload.get("notification");
            Map<String, Object> data = (Map<String, Object>) n.get("data");
            Map<String, Object> click = (Map<String, Object>) ((Map<String, Object>) data.get("onActionClick")).get("default");
            jdbc.update("insert into notification_log (id, user_id, kind, title, body, url) values (?, ?, ?, ?, ?, ?)", UUID.randomUUID(), userId,
                    kind.name(), cut((String) n.get("title"), 200), cut((String) n.get("body"), 600), cut((String) click.get("url"), 300));
        } catch (RuntimeException e) {
            log.info("Notification not kept in the centre: {}", e.getMessage());
        }
    }

    private static String cut(String s, int max) {
        return s == null ? "" : s.length() <= max ? s : s.substring(0, max);
    }

    private boolean send(UUID id, String endpoint, String p256dh, String auth, byte[] payload, boolean urgent) {
        try {
            URI uri = URI.create(endpoint);
            String audience = uri.getScheme() + "://" + uri.getHost();
            String subject = props.url().startsWith("https://") ? props.url() : "mailto:noreply@mybody365.invalid";
            String jwt = WebPushCrypto.vapidJwt(audience, subject, Instant.now().plus(Duration.ofHours(12)).getEpochSecond(), privateKey());
            byte[] body = WebPushCrypto.encrypt(payload, WebPushCrypto.unb64(p256dh), WebPushCrypto.unb64(auth));
            int status = transport.post(uri, Map.of("TTL", urgent ? "60" : "43200", "Urgency", urgent ? "high" : "normal", "Content-Encoding", "aes128gcm",
                    "Content-Type", "application/octet-stream", "Authorization", "vapid t=" + jwt + ", k=" + publicKey()), body);
            if (status == 404 || status == 410) {
                // the device unsubscribed or the app was removed
                jdbc.update("delete from push_subscription where id = ?", id);
                return false;
            }
            if (status >= 300) {
                log.info("Push refused by {} ({})", uri.getHost(), status);
                return false;
            }
            jdbc.update("update push_subscription set last_used_at = ? where id = ?", Timestamp.from(Instant.now()), id);
            return true;
        } catch (Exception e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.info("Push failed: {}", e.getMessage());
            return false;
        }
    }

    private PrivateKey privateKey() {
        if (vapidPrivate == null) {
            publicKey();
        }
        return vapidPrivate;
    }

    /** what Angular's service worker shows (notification) and where a tap leads (onActionClick) */
    static Map<String, Object> payload(Kind kind, boolean en, Map<String, String> args) {
        String[] t = texts(kind, en, args);
        String url = switch (kind) {
            case DAILY_PHOTO -> "/app/photos/camera";
            case GYM -> "/app/workouts";
            case NUDGE, FRIEND_REQUEST, FRIEND_ACCEPTED, FRIEND_POST, FRIEND_CHEER -> "/app/friends";
            case FRIEND_CHALLENGE, CHALLENGE_REMINDER -> "/app/challenges";
            case UPDATE -> "/changelog";
            case FEEDBACK -> "/app/admin/feedback";
            case TIMER -> "/app/timer";
            // the recipe itself (an address of the app only)
            case FRIEND_RECIPE -> args.getOrDefault("path", "").startsWith("/app/meals/recipes/") ? args.get("path") : "/app/meals/recipes";
            default -> "/app";
        };
        return Map.of("notification", Map.of(
                "title", t[0],
                "body", t[1],
                "icon", "/icons/icon-192.png",
                "badge", "/icons/badge-96.png",
                "tag", kind.name().toLowerCase(Locale.ROOT),
                "data", Map.of("onActionClick", Map.of("default", Map.of("operation", "navigateLastFocusedOrOpen", "url", url)))));
    }

    static String[] texts(Kind kind, boolean en, Map<String, String> args) {
        String n = args.getOrDefault("days", "0");
        String name = args.getOrDefault("name", "");
        return switch (kind) {
            case TEST -> en ? new String[] {"Notifications are on ✅", "Your reminders will show up here"}
                    : new String[] {"Notifications activées ✅", "Tes rappels arriveront ici"};
            case DAILY_WEIGH -> "0".equals(n)
                    ? (en ? new String[] {"Your flame is waiting 🔥", "One weigh-in and your flame lights up"}
                            : new String[] {"Ta flamme t’attend 🔥", "Une pesée et ta flamme s’allume"})
                    : (en ? new String[] {"Keep your flame going 🔥", "Weigh yourself to keep your " + n + "-day flame"}
                            : new String[] {"Garde ta flamme 🔥", "Pèse-toi pour garder tes " + n + " jours de flamme"});
            case DAILY_PHOTO -> en ? new String[] {"Today’s photo 📸", "Same place, same light: ten seconds and it is done"}
                    : new String[] {"Photo du jour 📸", "Même endroit, même lumière : dix secondes et c’est fait"};
            case GYM -> en ? new String[] {"Gym time 💪", "Your workout is waiting. You will thank yourself tonight"}
                    : new String[] {"C’est l’heure de la salle 💪", "Ta séance t’attend. Tu te remercieras ce soir"};
            case NUDGE -> en ? new String[] {name + " is thinking of you 💪", "A little reminder for your MyBody365 day"}
                    : new String[] {name + " pense à toi 💪", "Un petit rappel pour ta journée MyBody365"};
            case FRIEND_REQUEST -> en ? new String[] {name + " wants to be your friend 👋", "Open MyBody365 to accept or decline"}
                    : new String[] {name + " veut devenir ton ami 👋", "Ouvre MyBody365 pour accepter ou refuser"};
            case FRIEND_ACCEPTED -> en ? new String[] {name + " accepted your request 🎉", "You can now cheer each other on"}
                    : new String[] {name + " a accepté ta demande 🎉", "Vous pouvez maintenant vous encourager"};
            case WATER -> {
                String glasses = args.getOrDefault("glasses", "0");
                String goal = args.getOrDefault("goal", "8");
                boolean one = "0".equals(glasses) || "1".equals(glasses);
                yield en ? new String[] {"A glass of water? 💧", "You are at " + glasses + " out of " + goal + " glasses today"}
                        : new String[] {"Un verre d’eau ? 💧", "Tu en es à " + glasses + (one ? " verre" : " verres") + " sur " + goal
                                + " aujourd’hui"};
            }
            case FEEDBACK -> {
                String about = args.getOrDefault("kind", "OTHER");
                String what = switch (about) {
                    case "IDEA" -> en ? "an idea 💡" : "une idée 💡";
                    case "BUG" -> en ? "a bug 🐞" : "un bug 🐞";
                    default -> en ? "a message ✉️" : "un message ✉️";
                };
                yield new String[] {(en ? name + " sent " : name + " a envoyé ") + what, args.getOrDefault("text", "")};
            }
            case FRIEND_POST -> switch (args.getOrDefault("kind", "PROGRESS")) {
                case "DAY" -> en ? new String[] {name + " shared their day 🍽️", "See what they ate and cheer them on"}
                        : new String[] {name + " partage sa journée 🍽️", "Découvre ses repas du jour, un bravo fait toujours plaisir"};
                case "MILESTONE" -> en ? new String[] {name + " passed a milestone 🏅", "One more step towards the goal: say bravo"}
                        : new String[] {name + " a passé un palier 🏅", "Une étape de plus vers l’objectif : un bravo ?"};
                default -> en ? new String[] {name + " shared their progress 📈", "Open MyBody365 to see it and cheer them on"}
                        : new String[] {name + " partage son avancée 📈", "Ouvre MyBody365 pour la voir et l’encourager"};
            };
            case FRIEND_CHALLENGE -> {
                String days = args.getOrDefault("days", "7");
                String what = switch (args.getOrDefault("kind", "WEIGH")) {
                    case "WATER" -> en ? "your water goal every day" : "ton objectif d’eau chaque jour";
                    case "MEALS" -> en ? "your meals noted every day" : "tes repas notés chaque jour";
                    case "PHOTO" -> en ? "the photo of the day" : "la photo du jour";
                    default -> en ? "a weigh-in every day" : "une pesée chaque jour";
                };
                yield en ? new String[] {name + " challenges you 🏆", what.substring(0, 1).toUpperCase() + what.substring(1) + " for " + days + " days: are you in?"}
                        : new String[] {name + " te lance un défi 🏆", what.substring(0, 1).toUpperCase() + what.substring(1) + " pendant " + days + " jours : tu relèves ?"};
            }
            case BP_REMINDER -> "EVENING".equals(args.get("moment"))
                    ? (en ? new String[] {"Your evening blood pressure 🩺", "Calm, before bed: 3 readings a minute apart"}
                            : new String[] {"Ta tension du soir 🩺", "Au calme, avant le coucher : 3 mesures à une minute d’écart"})
                    : (en ? new String[] {"Your morning blood pressure 🩺", "Seated and calm, before breakfast and your medicines: 3 readings a minute apart"}
                            : new String[] {"Ta tension du matin 🩺", "Assis, au calme, avant le petit-déjeuner et tes médicaments : 3 mesures à une minute d’écart"});
            // never the medicine's name: a locked screen is seen by others
            case PILL -> {
                String time = args.getOrDefault("time", "");
                int count = Integer.parseInt(args.getOrDefault("count", "1"));
                yield count > 1
                        ? (en ? new String[] {"Your " + count + " intakes of " + time + " 💊", "Open MyBody365 to tick them in your pill box"}
                                : new String[] {"Tes " + count + " prises de " + time + " 💊", "Ouvre MyBody365 pour les cocher dans ton pilulier"})
                        : (en ? new String[] {"Your " + time + " treatment 💊", "Open MyBody365 to tick it in your pill box"}
                                : new String[] {"Ton traitement de " + time + " 💊", "Ouvre MyBody365 pour le cocher dans ton pilulier"});
            }
            case CHALLENGE_REMINDER -> {
                int count = Integer.parseInt(args.getOrDefault("count", "1"));
                String day = args.getOrDefault("day", "1");
                String length = args.getOrDefault("length", "7");
                String with = name.isBlank() ? "" : (en ? " with " : " avec ") + name;
                if (count > 1) {
                    yield en ? new String[] {count + " challenges are waiting for you 🏆", "Today is not done yet: open MyBody365 to keep your days"}
                            : new String[] {count + " défis t’attendent 🏆", "Ta journée n’est pas encore validée : ouvre MyBody365 pour garder tes jours"};
                }
                String what = switch (args.getOrDefault("kind", "WEIGH")) {
                    case "WATER" -> en ? "Your glasses of water count" : "Tes verres d’eau comptent";
                    case "MEALS" -> en ? "Your three meals noted count" : "Tes trois repas notés comptent";
                    case "PHOTO" -> en ? "Your photo of the day counts" : "Ta photo du jour compte";
                    default -> en ? "Your weigh-in counts" : "Ta pesée compte";
                };
                yield en ? new String[] {"Your challenge is waiting 🏆", what + " for the challenge" + with + " (day " + day + " of " + length + ")"}
                        : new String[] {"Ton défi t’attend 🏆", what + " pour le défi" + with + " (jour " + day + " sur " + length + ")"};
            }
            case FRIEND_CHEER -> en ? new String[] {name + " cheered you on 👏", "Bravo for what you shared: keep going"}
                    : new String[] {name + " t’encourage 👏", "Bravo pour ce que tu as partagé, continue comme ça"};
            case FRIEND_RECIPE -> {
                String recipe = args.getOrDefault("recipe", "");
                yield en ? new String[] {name + " shared a recipe 🍳", recipe + ", now in your friends’ recipes"}
                        : new String[] {name + " a partagé une recette 🍳", recipe + ", à découvrir dans les recettes de tes amis"};
            }
            case TIMER -> {
                String round = args.getOrDefault("round", "1");
                String total = args.getOrDefault("total", "1");
                yield switch (args.getOrDefault("phase", "DONE")) {
                    case "WORK" -> en ? new String[] {"Go! 💪", "Round " + round + " of " + total}
                            : new String[] {"C’est reparti 💪", "Série " + round + " sur " + total};
                    case "REST" -> en ? new String[] {"Rest 😮‍💨", "Round " + round + " of " + total + " done, catch your breath"}
                            : new String[] {"Repos 😮‍💨", "Série " + round + " sur " + total + " terminée, souffle un peu"};
                    default -> en ? new String[] {"Workout done 🎉", "Well done! Note it in the timer"}
                            : new String[] {"Séance terminée 🎉", "Bravo ! Pense à la noter dans le minuteur"};
                };
            }
            case UPDATE -> en ? new String[] {"MyBody365 " + args.getOrDefault("version", "") + " is here ✨",
                    "Open the app to discover what’s new"}
                    : new String[] {"MyBody365 " + args.getOrDefault("version", "") + " est arrivée ✨",
                            "Ouvre l’app pour découvrir les nouveautés"};
        };
    }
}
