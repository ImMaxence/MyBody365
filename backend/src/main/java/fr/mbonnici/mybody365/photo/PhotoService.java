package fr.mbonnici.mybody365.photo;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.config.AppProperties;
import fr.mbonnici.mybody365.media.ImageProcessor;
import fr.mbonnici.mybody365.media.ImageProcessor.Processed;
import fr.mbonnici.mybody365.storage.ObjectStorage;
import fr.mbonnici.mybody365.storage.QuotaService;
import fr.mbonnici.mybody365.tracking.BodyLog;
import fr.mbonnici.mybody365.tracking.BodyLogRepository;
import fr.mbonnici.mybody365.tracking.TrackingService;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Upload (decoded, resized, re-encoded), listing, deletion and access rules of body photos. */
@Service
public class PhotoService {

    private static final Logger log = LoggerFactory.getLogger(PhotoService.class);

    public static final int FULL_SIDE = 1600;
    public static final int THUMB_SIDE = 480;

    public record PhotoDto(UUID id, LocalDate day, Photo.Pose pose, int width, int height, Double weightKg, String url,
            String thumbUrl, Instant createdAt) {}

    private final PhotoRepository photos;
    private final BodyLogRepository logs;
    private final ObjectStorage storage;
    private final ImageProcessor images;
    private final QuotaService quota;
    private final AppProperties props;
    private final List<PhotoAccessRule> extraRules;

    public PhotoService(PhotoRepository photos, BodyLogRepository logs, ObjectStorage storage, ImageProcessor images,
            QuotaService quota, AppProperties props, List<PhotoAccessRule> extraRules) {
        this.photos = photos;
        this.logs = logs;
        this.storage = storage;
        this.images = images;
        this.quota = quota;
        this.props = props;
        this.extraRules = extraRules;
    }

    public List<PhotoDto> list(UUID userId) {
        Map<LocalDate, Double> weights = new HashMap<>();
        for (BodyLog l : logs.findByUserIdOrderByDayAsc(userId)) {
            if (l.getWeightKg() != null) {
                weights.put(l.getDay(), l.getWeightKg().doubleValue());
            }
        }
        return photos.findByUserIdOrderByDayDescPoseAsc(userId).stream().map(p -> dto(p, weights.get(p.getDay()))).toList();
    }

    public PhotoDto dto(Photo p, Double weightKg) {
        return new PhotoDto(p.getId(), p.getDay(), p.getPose(), p.getWidth(), p.getHeight(), weightKg,
                "/api/photos/" + p.getId() + "/full", "/api/photos/" + p.getId() + "/thumb", p.getCreatedAt());
    }

    public boolean hasPhoto(UUID userId, LocalDate day) {
        return photos.existsByUserIdAndDay(userId, day);
    }

    /** a new photo for the day and pose replaces the one already there */
    @Transactional
    public PhotoDto upload(UUID userId, byte[] file, LocalDate day, Photo.Pose pose) {
        LocalDate today = TrackingService.today();
        LocalDate d = day == null ? today : day;
        if (d.isAfter(today.plusDays(1)) || d.isBefore(today.minusYears(2))) {
            throw ApiException.badRequest("invalid_day");
        }
        if (file == null || file.length == 0) {
            throw ApiException.badRequest("invalid_image");
        }
        if (file.length > props.storage().maxUploadMb() * 1024L * 1024L) {
            throw ApiException.badRequest("file_too_large");
        }
        Processed img = images.process(file, FULL_SIDE, THUMB_SIDE);
        Optional<Photo> previous = photos.findByUserIdAndDayAndPose(userId, d, pose);
        long freed = previous.map(p -> p.getBytes() + p.getThumbBytes()).orElse(0L);
        quota.check(userId, img.full().length + img.thumb().length, freed);

        Photo photo = new Photo(userId, d, pose, img.width(), img.height(), img.full().length, img.thumb().length, img.format());
        storage.put(photo.key(), img.full(), img.contentType());
        storage.put(photo.thumbKey(), img.thumb(), img.contentType());
        try {
            previous.ifPresent(p -> {
                photos.delete(p);
                photos.flush();
            });
            photos.save(photo);
        } catch (RuntimeException e) {
            removeFiles(photo);
            throw e;
        }
        previous.ifPresent(this::removeFiles);
        Double weight = logs.findById(new BodyLog.Key(userId, d)).map(l -> l.getWeightKg() == null ? null : l.getWeightKg().doubleValue())
                .orElse(null);
        return dto(photo, weight);
    }

    @Transactional
    public void delete(UUID userId, UUID photoId) {
        Photo p = photos.findById(photoId).filter(x -> x.getUserId().equals(userId)).orElseThrow(ApiException::notFound);
        photos.delete(p);
        removeFiles(p);
    }

    /** the picture, when the viewer may see it (its owner, or what the extra rules allow); otherwise 404 */
    public Photo viewable(UUID photoId, UUID viewerId) {
        Photo p = photos.findById(photoId).orElseThrow(ApiException::notFound);
        if (p.getUserId().equals(viewerId) || extraRules.stream().anyMatch(r -> r.canView(p, viewerId))) {
            return p;
        }
        throw ApiException.notFound();
    }

    public byte[] read(Photo p, boolean thumb) {
        byte[] bytes = storage.get(thumb ? p.thumbKey() : p.key());
        if (bytes == null) {
            throw ApiException.notFound();
        }
        return bytes;
    }

    void removeFiles(Photo p) {
        try {
            storage.delete(p.key());
            storage.delete(p.thumbKey());
        } catch (RuntimeException e) {
            log.warn("Could not delete the files of photo {}: {}", p.getId(), e.getMessage());
        }
    }
}
