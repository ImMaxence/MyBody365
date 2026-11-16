package fr.mbonnici.mybody365.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

/** The phone's side of RFC 8291, written independently: what the server encrypts, it can read. */
class WebPushCryptoTest {

    @Test
    void aPayloadEncryptedForASubscriptionIsReadByItsDevice() throws Exception {
        KeyPair device = WebPushCrypto.newKeyPair();
        byte[] devicePublic = WebPushCrypto.rawPublic((ECPublicKey) device.getPublic());
        byte[] auth = new byte[16];
        new SecureRandom().nextBytes(auth);
        byte[] message = "{\"notification\":{\"title\":\"Garde ta flamme 🔥\"}}".getBytes(StandardCharsets.UTF_8);

        byte[] body = WebPushCrypto.encrypt(message, devicePublic, auth);

        // header: salt (16) ‖ record size (4) ‖ key id length (1) ‖ sender key (65)
        ByteBuffer buf = ByteBuffer.wrap(body);
        byte[] salt = new byte[16];
        buf.get(salt);
        assertThat(buf.getInt()).isEqualTo(4096);
        assertThat(buf.get()).isEqualTo((byte) 65);
        byte[] senderPublic = new byte[65];
        buf.get(senderPublic);
        byte[] cipher = new byte[buf.remaining()];
        buf.get(cipher);

        byte[][] keys = WebPushCrypto.keys(device.getPrivate(), WebPushCrypto.publicFromRaw(senderPublic), devicePublic, senderPublic, auth,
                salt);
        Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
        aes.init(Cipher.DECRYPT_MODE, new SecretKeySpec(keys[0], "AES"), new GCMParameterSpec(128, keys[1]));
        byte[] plain = aes.doFinal(cipher);
        // last record: the content, then the 0x02 delimiter
        assertThat(plain[plain.length - 1]).isEqualTo((byte) 2);
        assertThat(Arrays.copyOf(plain, plain.length - 1)).isEqualTo(message);
    }

    @Test
    void theVapidTokenIsSignedWithTheAppKey() throws Exception {
        KeyPair app = WebPushCrypto.newKeyPair();
        String jwt = WebPushCrypto.vapidJwt("https://fcm.googleapis.com", "https://mybody365.mbonnici.fr", 1_900_000_000L, app.getPrivate());
        String[] parts = jwt.split("\\.");
        assertThat(parts).hasSize(3);
        assertThat(new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8))
                .contains("\"aud\":\"https://fcm.googleapis.com\"").contains("\"exp\":1900000000");
        byte[] signature = WebPushCrypto.unb64(parts[2]);
        assertThat(signature).hasSize(64);
        Signature verify = Signature.getInstance("SHA256withECDSAinP1363Format");
        verify.initVerify(WebPushCrypto.publicFromRaw(WebPushCrypto.rawPublic((ECPublicKey) app.getPublic())));
        verify.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        assertThat(verify.verify(signature)).isTrue();
    }

    @Test
    void notificationsLeadToTheRightScreen() {
        var p = PushService.payload(PushService.Kind.DAILY_PHOTO, false, java.util.Map.of());
        assertThat(p.toString()).contains("/app/photos/camera").contains("Photo du jour");
        assertThat(PushService.texts(PushService.Kind.DAILY_WEIGH, true, java.util.Map.of("days", "12"))[1]).contains("12-day");
    }
}
