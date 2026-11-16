package fr.mbonnici.mybody365.storage;

import java.util.UUID;

/**
 * Where pictures live. Keys are always under {@code u/{userId}/}: deleting an account deletes its prefix.
 * Implemented on S3 (SeaweedFS in the Compose files, any S3-compatible service otherwise).
 */
public interface ObjectStorage {

    void put(String key, byte[] bytes, String contentType);

    /** a large object (a backup) straight from a file */
    void putFile(String key, java.nio.file.Path file, String contentType);

    /** the object's bytes, or null when it does not exist */
    byte[] get(String key);

    /** a large object to a file; false when it does not exist */
    boolean getToFile(String key, java.nio.file.Path file);

    void delete(String key);

    /** deletes every object whose key starts with the prefix; returns how many went */
    int deletePrefix(String prefix);

    static String userPrefix(UUID userId) {
        return "u/" + userId + "/";
    }
}
