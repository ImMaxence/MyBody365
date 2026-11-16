package fr.mbonnici.mybody365.push;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import org.springframework.stereotype.Component;

/** The last step of a notification: the POST to the push service (replaced by a recorder in the tests). */
public interface PushTransport {

    /** @return the HTTP status of the push service */
    int post(URI endpoint, Map<String, String> headers, byte[] body) throws Exception;

    @Component
    class Http implements PushTransport {

        private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();

        @Override
        public int post(URI endpoint, Map<String, String> headers, byte[] body) throws Exception {
            HttpRequest.Builder req = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(10))
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body));
            headers.forEach(req::header);
            return http.send(req.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
        }
    }
}
