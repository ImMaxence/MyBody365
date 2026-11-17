package fr.mbonnici.mybody365.user;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.config.AppProperties;
import fr.mbonnici.mybody365.media.ImageProcessor;
import fr.mbonnici.mybody365.media.ImageProcessor.Processed;
import fr.mbonnici.mybody365.storage.ObjectStorage;
import fr.mbonnici.mybody365.storage.QuotaService;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * A profile picture of one's own: decoded and drawn again like every picture (no metadata left), cropped
 * to a square, stored once in the bucket under u/{id}/avatar_{version}. A new one replaces the old one,
 * which is deleted; without one, the first letter of the name is shown (never the Google picture).
 */
@Service
public class AvatarService {

    private static final Logger log = LoggerFactory.getLogger(AvatarService.class);
    public static final int SIDE = 320;

    private final AppUserRepository users;
    private final ObjectStorage storage;
    private final ImageProcessor images;
    private final QuotaService quota;
    private final AppProperties props;

    public AvatarService(AppUserRepository users, ObjectStorage storage, ImageProcessor images, QuotaService quota, AppProperties props) {
        this.users = users;
        this.storage = storage;
        this.images = images;
        this.quota = quota;
        this.props = props;
    }

    /**
     * A version never used before, even after the picture was removed: the browsers keep a picture for a year
     * under its address (?v=…), and a removed then new picture with the old number showed the old one. Drawn at
     * random among two billion: never the same twice in practice, and never the current one.
     */
    static int nextVersion(Integer old) {
        int v;
        do {
            v = ThreadLocalRandom.current().nextInt(2, Integer.MAX_VALUE);
        } while (old != null && v == old);
        return v;
    }

    static String key(UUID userId, int version) {
        return ObjectStorage.userPrefix(userId) + "avatar_" + version;
    }

    public AppUser set(AppUser user, byte[] file) {
        if (file == null || file.length == 0) {
            throw ApiException.badRequest("invalid_image");
        }
        if (file.length > props.storage().maxUploadMb() * 1024L * 1024L) {
            throw ApiException.badRequest("file_too_large");
        }
        Processed img = images.square(file, SIDE);
        Long oldBytes = user.getAvatarBytes();
        quota.check(user.getId(), img.full().length, oldBytes == null ? 0 : oldBytes);
        Integer old = user.getAvatarVersion();
        int version = nextVersion(old);
        storage.put(key(user.getId(), version), img.full(), img.contentType());
        user.setAvatarVersion(version);
        user.setAvatarBytes((long) img.full().length);
        try {
            user = users.save(user);
        } catch (RuntimeException e) {
            drop(key(user.getId(), version));
            throw e;
        }
        if (old != null) {
            drop(key(user.getId(), old));
        }
        return user;
    }

    /** back to the initial */
    public AppUser remove(AppUser user) {
        Integer old = user.getAvatarVersion();
        if (old == null) {
            return user;
        }
        user.setAvatarVersion(null);
        user.setAvatarBytes(null);
        user = users.save(user);
        drop(key(user.getId(), old));
        return user;
    }

    /** the stored picture of a version (the current one only: an old URL gives 404) */
    public byte[] get(AppUser owner, int version) {
        if (owner.getAvatarVersion() == null || owner.getAvatarVersion() != version) {
            throw ApiException.notFound();
        }
        byte[] bytes = storage.get(key(owner.getId(), version));
        if (bytes == null) {
            throw ApiException.notFound();
        }
        return bytes;
    }

    private void drop(String key) {
        try {
            storage.delete(key);
        } catch (RuntimeException e) {
            // a forgotten file only costs space; it goes with the account's prefix in the end
            log.warn("Could not delete {}: {}", key, e.getMessage());
        }
    }
}
