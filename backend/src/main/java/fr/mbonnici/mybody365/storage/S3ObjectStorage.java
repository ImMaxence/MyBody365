package fr.mbonnici.mybody365.storage;

import fr.mbonnici.mybody365.config.AppProperties;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.ObjectIdentifier;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.model.S3Object;

/**
 * S3 storage with path-style URLs (SeaweedFS, MinIO, Garage…). The SDK's default integrity checksums
 * are only sent when an operation requires them: S3-compatible servers do not all understand them.
 */
@Component
public class S3ObjectStorage implements ObjectStorage {

    private static final Logger log = LoggerFactory.getLogger(S3ObjectStorage.class);

    private final S3Client s3;
    private final String bucket;

    public S3ObjectStorage(AppProperties props) {
        AppProperties.Storage cfg = props.storage();
        this.bucket = cfg.bucket();
        this.s3 = S3Client.builder()
                .endpointOverride(URI.create(cfg.endpoint()))
                .region(Region.of(cfg.region()))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(
                        nonBlank(cfg.accessKey(), "S3_ACCESS_KEY"), nonBlank(cfg.secretKey(), "S3_SECRET_KEY"))))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
                .httpClient(UrlConnectionHttpClient.create())
                .build();
    }

    private static String nonBlank(String v, String name) {
        if (v == null || v.isBlank()) {
            throw new IllegalStateException(name + " is not set");
        }
        return v;
    }

    /** creates the bucket on the first start; the app still starts if the storage is late (retried on use) */
    @EventListener(ApplicationReadyEvent.class)
    public void ensureBucket() {
        try {
            s3.headBucket(b -> b.bucket(bucket));
        } catch (NoSuchBucketException e) {
            s3.createBucket(b -> b.bucket(bucket));
            log.info("Created the storage bucket {}", bucket);
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                s3.createBucket(b -> b.bucket(bucket));
                log.info("Created the storage bucket {}", bucket);
            } else {
                log.warn("Storage bucket check failed: {}", e.getMessage());
            }
        } catch (RuntimeException e) {
            log.warn("Storage unreachable at startup: {}", e.getMessage());
        }
    }

    @Override
    public void put(String key, byte[] bytes, String contentType) {
        try {
            s3.putObject(b -> b.bucket(bucket).key(key).contentType(contentType), RequestBody.fromBytes(bytes));
        } catch (NoSuchBucketException e) {
            ensureBucket();
            s3.putObject(b -> b.bucket(bucket).key(key).contentType(contentType), RequestBody.fromBytes(bytes));
        }
    }

    @Override
    public void putFile(String key, java.nio.file.Path file, String contentType) {
        s3.putObject(b -> b.bucket(bucket).key(key).contentType(contentType), RequestBody.fromFile(file));
    }

    @Override
    public boolean getToFile(String key, java.nio.file.Path file) {
        try {
            java.nio.file.Files.deleteIfExists(file);
            s3.getObject(b -> b.bucket(bucket).key(key), file);
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        } catch (java.io.IOException e) {
            throw new java.io.UncheckedIOException(e);
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                return false;
            }
            throw e;
        }
    }

    @Override
    public byte[] get(String key) {
        try {
            return s3.getObjectAsBytes(b -> b.bucket(bucket).key(key)).asByteArray();
        } catch (NoSuchKeyException e) {
            return null;
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                return null;
            }
            throw e;
        }
    }

    @Override
    public void delete(String key) {
        s3.deleteObject(b -> b.bucket(bucket).key(key));
    }

    @Override
    public int deletePrefix(String prefix) {
        if (prefix == null || prefix.length() < 4) {
            throw new IllegalArgumentException("refusing to delete a short prefix");
        }
        int count = 0;
        String token = null;
        do {
            String t = token;
            var page = s3.listObjectsV2(b -> b.bucket(bucket).prefix(prefix).continuationToken(t).maxKeys(1000));
            List<ObjectIdentifier> ids = new ArrayList<>();
            for (S3Object o : page.contents()) {
                ids.add(ObjectIdentifier.builder().key(o.key()).build());
            }
            if (!ids.isEmpty()) {
                // one by one: some S3-compatible servers want a Content-MD5 on batch deletes
                for (ObjectIdentifier id : ids) {
                    s3.deleteObject(b -> b.bucket(bucket).key(id.key()));
                }
                count += ids.size();
            }
            token = Boolean.TRUE.equals(page.isTruncated()) ? page.nextContinuationToken() : null;
        } while (token != null);
        return count;
    }

}
