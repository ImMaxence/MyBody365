package fr.mbonnici.mybody365.push;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Web Push with the JDK only: message encryption (RFC 8291, "aes128gcm" of RFC 8188) and the VAPID
 * signature of the request (RFC 8292). Keys are P-256; public keys travel as 65-byte uncompressed points.
 */
public final class WebPushCrypto {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int RECORD_SIZE = 4096;

    private WebPushCrypto() {}

    public static KeyPair newKeyPair() throws GeneralSecurityException {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC");
        kpg.initialize(new ECGenParameterSpec("secp256r1"), RANDOM);
        return kpg.generateKeyPair();
    }

    /** 0x04 ‖ X ‖ Y */
    public static byte[] rawPublic(ECPublicKey key) {
        byte[] out = new byte[65];
        out[0] = 4;
        copy32(key.getW().getAffineX(), out, 1);
        copy32(key.getW().getAffineY(), out, 33);
        return out;
    }

    public static ECPublicKey publicFromRaw(byte[] raw) throws GeneralSecurityException {
        if (raw.length != 65 || raw[0] != 4) {
            throw new GeneralSecurityException("not an uncompressed P-256 point");
        }
        AlgorithmParameters ap = AlgorithmParameters.getInstance("EC");
        ap.init(new ECGenParameterSpec("secp256r1"));
        ECParameterSpec spec = ap.getParameterSpec(ECParameterSpec.class);
        ECPoint point = new ECPoint(new BigInteger(1, Arrays.copyOfRange(raw, 1, 33)), new BigInteger(1, Arrays.copyOfRange(raw, 33, 65)));
        return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(point, spec));
    }

    /**
     * The encrypted body for a subscription: salt ‖ record size ‖ key id length ‖ sender public key ‖
     * ciphertext (one record, padding delimiter 0x02).
     */
    public static byte[] encrypt(byte[] payload, byte[] uaPublicRaw, byte[] authSecret) throws GeneralSecurityException {
        ECPublicKey uaPublic = publicFromRaw(uaPublicRaw);
        KeyPair ephemeral = newKeyPair();
        byte[] asPublic = rawPublic((ECPublicKey) ephemeral.getPublic());
        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        byte[][] keys = keys(ephemeral.getPrivate(), uaPublic, uaPublicRaw, asPublic, authSecret, salt);

        byte[] plain = Arrays.copyOf(payload, payload.length + 1);
        plain[payload.length] = 2;
        Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
        aes.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(keys[0], "AES"), new GCMParameterSpec(128, keys[1]));
        byte[] cipher = aes.doFinal(plain);
        if (cipher.length + 86 > RECORD_SIZE) {
            throw new GeneralSecurityException("payload too large for one record");
        }
        return ByteBuffer.allocate(16 + 4 + 1 + 65 + cipher.length).put(salt).putInt(RECORD_SIZE).put((byte) 65).put(asPublic).put(cipher)
                .array();
    }

    /** [content encryption key (16 bytes), nonce (12 bytes)], from either side's private key */
    static byte[][] keys(PrivateKey ownPrivate, ECPublicKey otherPublic, byte[] uaPublicRaw, byte[] asPublicRaw, byte[] authSecret,
            byte[] salt) throws GeneralSecurityException {
        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(ownPrivate);
        ka.doPhase(otherPublic, true);
        byte[] ecdh = ka.generateSecret();
        byte[] keyInfo = concat("WebPush: info\0".getBytes(StandardCharsets.US_ASCII), uaPublicRaw, asPublicRaw);
        byte[] ikm = hkdf(authSecret, ecdh, keyInfo, 32);
        byte[] cek = hkdf(salt, ikm, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), 16);
        byte[] nonce = hkdf(salt, ikm, "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), 12);
        return new byte[][] {cek, nonce};
    }

    /** HKDF-SHA256 for at most 32 bytes (one block of output) */
    static byte[] hkdf(byte[] salt, byte[] ikm, byte[] info, int length) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(salt, "HmacSHA256"));
        byte[] prk = mac.doFinal(ikm);
        mac.init(new SecretKeySpec(prk, "HmacSHA256"));
        mac.update(info);
        mac.update((byte) 1);
        return Arrays.copyOf(mac.doFinal(), length);
    }

    /** the VAPID JWT (ES256, raw R ‖ S signature) for the push service of the endpoint */
    public static String vapidJwt(String audience, String subject, long expiresAtEpochSeconds, PrivateKey key)
            throws GeneralSecurityException {
        String header = b64("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.UTF_8));
        String claims = b64(("{\"aud\":\"" + audience + "\",\"exp\":" + expiresAtEpochSeconds + ",\"sub\":\"" + subject + "\"}")
                .getBytes(StandardCharsets.UTF_8));
        Signature sig = Signature.getInstance("SHA256withECDSAinP1363Format");
        sig.initSign(key);
        sig.update((header + "." + claims).getBytes(StandardCharsets.US_ASCII));
        return header + "." + claims + "." + b64(sig.sign());
    }

    public static String b64(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static byte[] unb64(String s) {
        return Base64.getUrlDecoder().decode(s.trim().replace('+', '-').replace('/', '_').replace("=", ""));
    }

    private static void copy32(BigInteger v, byte[] out, int offset) {
        byte[] b = v.toByteArray();
        int start = Math.max(0, b.length - 32);
        int len = b.length - start;
        System.arraycopy(b, start, out, offset + 32 - len, len);
    }

    private static byte[] concat(byte[]... parts) {
        int n = 0;
        for (byte[] p : parts) {
            n += p.length;
        }
        ByteBuffer buf = ByteBuffer.allocate(n);
        for (byte[] p : parts) {
            buf.put(p);
        }
        return buf.array();
    }
}
