package fr.mbonnici.mybody365.backup;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * AES-256-GCM for the few secrets the app keeps for its members (the Google Drive refresh tokens). The
 * key is derived (HKDF-SHA256) from a server secret that never sits in the database, so a copy of the
 * database alone reveals nothing.
 */
final class SecretBox {

    private static final SecureRandom RANDOM = new SecureRandom();
    private final SecretKeySpec key;

    SecretBox(String serverSecret, String purpose) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec("mybody365".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] prk = mac.doFinal(serverSecret.getBytes(StandardCharsets.UTF_8));
            mac.init(new SecretKeySpec(prk, "HmacSHA256"));
            mac.update(purpose.getBytes(StandardCharsets.UTF_8));
            mac.update((byte) 1);
            this.key = new SecretKeySpec(Arrays.copyOf(mac.doFinal(), 32), "AES");
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    String seal(String plain) {
        try {
            byte[] iv = new byte[12];
            RANDOM.nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv));
            byte[] ct = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(12 + ct.length).put(iv).put(ct).array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /** null when it cannot be opened (the server secret changed) */
    String open(String sealed) {
        try {
            byte[] all = Base64.getDecoder().decode(sealed);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, all, 0, 12));
            return new String(c.doFinal(all, 12, all.length - 12), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            return null;
        }
    }
}
