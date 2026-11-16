package fr.mbonnici.mybody365;

import fr.mbonnici.mybody365.push.PushTransport;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

/** Notifications "sent" during the tests: kept here instead of reaching a real push service. */
public class RecordingPushTransport implements PushTransport {

    public record Sent(URI endpoint, Map<String, String> headers, byte[] body) {}

    public final List<Sent> sent = new CopyOnWriteArrayList<>();

    @Override
    public int post(URI endpoint, Map<String, String> headers, byte[] body) {
        sent.add(new Sent(endpoint, headers, body));
        return 201;
    }
}
