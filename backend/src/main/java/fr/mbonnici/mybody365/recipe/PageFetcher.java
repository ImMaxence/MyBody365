package fr.mbonnici.mybody365.recipe;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.config.AppProperties;
import java.io.IOException;
import java.io.InputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** Reads a public web page for the recipe import (replaced by canned pages in the tests). */
public interface PageFetcher {

    /** the beginning of the page's HTML (the recipe data sits in its head) */
    String fetch(URI uri);

    /**
     * The server goes to an address a member typed: only public web servers on the usual ports, checked
     * again at each redirect, nothing on the private network (the database, the bucket, a cloud's
     * metadata service…). At most 3 MB read, 10 seconds, no cookie, no detail about the member.
     */
    @Component
    class Http implements PageFetcher {

        static final int MAX_BYTES = 3 * 1024 * 1024;
        private static final int MAX_REDIRECTS = 4;
        private static final Pattern CHARSET = Pattern.compile("charset=([\\w-]+)", Pattern.CASE_INSENSITIVE);

        private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER).build();
        private final String userAgent;

        public Http(AppProperties props) {
            this.userAgent = props.nutrition().offUserAgent();
        }

        @Override
        public String fetch(URI uri) {
            URI current = uri;
            for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
                checkPublic(current);
                HttpRequest req = HttpRequest.newBuilder(current).timeout(Duration.ofSeconds(10))
                        .header("User-Agent", userAgent)
                        .header("Accept", "text/html,application/xhtml+xml")
                        .header("Accept-Language", "fr,en;q=0.8")
                        .GET().build();
                HttpResponse<InputStream> res;
                try {
                    res = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
                } catch (IOException e) {
                    throw ApiException.badRequest("recipe_unreachable");
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw ApiException.badRequest("recipe_unreachable");
                }
                int status = res.statusCode();
                try (InputStream body = res.body()) {
                    if (status >= 300 && status < 400) {
                        String location = res.headers().firstValue("Location").orElseThrow(() -> ApiException.badRequest("recipe_unreachable"));
                        current = current.resolve(location.strip());
                        continue;
                    }
                    if (status != 200) {
                        throw ApiException.badRequest("recipe_unreachable");
                    }
                    String type = res.headers().firstValue("Content-Type").orElse("text/html").toLowerCase(Locale.ROOT);
                    if (!type.contains("html")) {
                        throw ApiException.badRequest("recipe_not_found");
                    }
                    byte[] bytes = body.readNBytes(MAX_BYTES);
                    Matcher m = CHARSET.matcher(type);
                    Charset charset = StandardCharsets.UTF_8;
                    if (m.find() && Charset.isSupported(m.group(1))) {
                        charset = Charset.forName(m.group(1));
                    }
                    return new String(bytes, charset);
                } catch (IOException e) {
                    throw ApiException.badRequest("recipe_unreachable");
                }
            }
            throw ApiException.badRequest("recipe_unreachable");
        }

        /** http(s) on the standard ports, to a name that only resolves to public addresses */
        static void checkPublic(URI u) {
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            if (!scheme.equals("https") && !scheme.equals("http")) {
                throw ApiException.badRequest("recipe_url_invalid");
            }
            int port = u.getPort();
            if (u.getHost() == null || u.getRawUserInfo() != null || (port != -1 && port != 80 && port != 443)) {
                throw ApiException.badRequest("recipe_url_invalid");
            }
            InetAddress[] all;
            try {
                all = InetAddress.getAllByName(u.getHost());
            } catch (UnknownHostException e) {
                throw ApiException.badRequest("recipe_unreachable");
            }
            for (InetAddress a : all) {
                if (!isPublic(a)) {
                    throw ApiException.badRequest("recipe_url_invalid");
                }
            }
        }

        static boolean isPublic(InetAddress a) {
            if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress() || a.isSiteLocalAddress()
                    || a.isMulticastAddress()) {
                return false;
            }
            byte[] b = a.getAddress();
            if (a instanceof Inet4Address) {
                int x = b[0] & 0xff;
                int y = b[1] & 0xff;
                return !(x == 0 || x == 10 || x == 127 || x >= 224
                        || (x == 100 && y >= 64 && y <= 127) // carrier-grade NAT
                        || (x == 169 && y == 254)
                        || (x == 172 && y >= 16 && y <= 31)
                        || (x == 192 && y == 168)
                        || (x == 192 && y == 0 && (b[2] & 0xff) == 0)
                        || (x == 198 && (y == 18 || y == 19)));
            }
            int x = b[0] & 0xff;
            if ((x & 0xfe) == 0xfc || (x == 0xfe && (b[1] & 0xc0) == 0x80)) {
                return false; // unique local, link-local
            }
            // ::ffff:a.b.c.d, an IPv4 address in disguise
            boolean mapped = true;
            for (int i = 0; i < 10; i++) {
                mapped &= b[i] == 0;
            }
            if (mapped && (b[10] & 0xff) == 0xff && (b[11] & 0xff) == 0xff) {
                try {
                    return isPublic(InetAddress.getByAddress(new byte[] {b[12], b[13], b[14], b[15]}));
                } catch (UnknownHostException e) {
                    return false;
                }
            }
            return true;
        }
    }
}
