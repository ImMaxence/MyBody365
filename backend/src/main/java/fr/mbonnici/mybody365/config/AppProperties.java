package fr.mbonnici.mybody365.config;

import java.net.URI;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Application settings bound from the {@code app.*} namespace (see application.yml). */
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        /** public URL of the app, without trailing slash (https://mybody365.mbonnici.fr) */
        String url,
        /** ADMIN_EMAILS: the Google account(s) that are always admins, required (see {@link #parseAdminEmails}) */
        List<String> adminEmails,
        @DefaultValue("false") boolean trustProxy,
        /** local only: GET /api/auth/dev-login opens a session without Google (refused unless url is localhost) */
        @DefaultValue("false") boolean devLogin,
        /** lifetime of the invitation and recovery links made by admins */
        @DefaultValue("24") int recoveryLinkHours,
        @DefaultValue RateLimit rateLimit,
        @DefaultValue Storage storage,
        @DefaultValue Nutrition nutrition) {

    public AppProperties {
        url = url == null ? "" : url.replaceAll("/+$", "");
        adminEmails = parseAdminEmails(adminEmails);
    }

    /**
     * ADMIN_EMAILS holds one or more addresses separated by ";" (a "," works too: Spring already
     * splits on it). There is no default: the application refuses to start without at least one
     * address, so nobody is ever admin by accident.
     */
    public static List<String> parseAdminEmails(List<String> raw) {
        List<String> emails = (raw == null ? List.<String>of() : raw).stream()
                .flatMap(v -> Arrays.stream(v.split("[;,]")))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(s -> s.toLowerCase(Locale.ROOT))
                .distinct()
                .toList();
        if (emails.isEmpty() || emails.stream().anyMatch(e -> e.contains("${"))) {
            throw new IllegalStateException(
                    "ADMIN_EMAILS is not set: give the Google address(es) of the admins, separated by ';'");
        }
        for (String e : emails) {
            if (!e.matches("[^@\s]+@[^@\s]+")) {
                throw new IllegalStateException("ADMIN_EMAILS: '" + e + "' is not an e-mail address");
            }
        }
        return emails;
    }

    public boolean isAdminEmail(String email) {
        return email != null && adminEmails.contains(email.trim().toLowerCase(Locale.ROOT));
    }

    /** WebAuthn relying party id: the host of the public URL (passkeys are bound to it). */
    public String rpId() {
        return URI.create(url).getHost();
    }

    /** scheme://host[:port] of the public URL, the only origin allowed to use the passkeys. */
    public String origin() {
        URI u = URI.create(url);
        return u.getScheme() + "://" + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "");
    }

    public boolean isLocal() {
        String host = rpId();
        return "localhost".equals(host) || "127.0.0.1".equals(host) || "[::1]".equals(host);
    }

    public record RateLimit(
            @DefaultValue("true") boolean enabled,
            @DefaultValue("600") int apiPerMinute,
            @DefaultValue("20") int authPerMinute,
            @DefaultValue("5") int accessRequestPerHour,
            /** photo and recipe image uploads, backup restores */
            @DefaultValue("120") int uploadPerHour,
            /** food searches and barcode lookups (Open Food Facts is asked through us) */
            @DefaultValue("60") int foodSearchPerMinute) {}

    /**
     * Object storage for photos and pictures: any S3-compatible service (SeaweedFS in the Compose files).
     * Every object lives under u/{userId}/, so an account's files go with it.
     */
    public record Storage(
            @DefaultValue("http://localhost:8333") String endpoint,
            @DefaultValue("us-east-1") String region,
            @DefaultValue("mybody365") String bucket,
            String accessKey,
            String secretKey,
            /** storage allowed per account unless an admin sets another quota */
            @DefaultValue("2048") int quotaMb,
            /** the largest picture accepted before processing */
            @DefaultValue("20") int maxUploadMb) {}

    /** Food data: Open Food Facts (asked live, then cached) and the Ciqual table (imported by an admin). */
    public record Nutrition(
            @DefaultValue("https://world.openfoodfacts.org") String offUrl,
            @DefaultValue("https://search.openfoodfacts.org") String offSearchUrl,
            /** Open Food Facts asks every client to name itself */
            @DefaultValue("MyBody365") String offUserAgent,
            /**
             * the Ciqual table (ANSES) on the French research data repository (Dataverse API): the import picks the
             * newest alim / compo XML files of the dataset; an admin starts it from the app
             */
            @DefaultValue("https://entrepot.recherche.data.gouv.fr/api/datasets/:persistentId/?persistentId=doi:10.57745/RDMHWY") String ciqualDatasetUrl) {}
}
