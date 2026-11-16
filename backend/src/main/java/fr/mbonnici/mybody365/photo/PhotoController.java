package fr.mbonnici.mybody365.photo;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.photo.PhotoService.PhotoDto;
import fr.mbonnici.mybody365.storage.QuotaService;
import fr.mbonnici.mybody365.user.UserService;
import java.io.IOException;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class PhotoController {

    private final PhotoService photos;
    private final QuotaService quota;
    private final UserService users;

    public PhotoController(PhotoService photos, QuotaService quota, UserService users) {
        this.photos = photos;
        this.quota = quota;
        this.users = users;
    }

    @GetMapping("/api/me/photos")
    public List<PhotoDto> list(Authentication auth) {
        return photos.list(users.current(auth).getId());
    }

    @PostMapping(value = "/api/me/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public PhotoDto upload(@RequestParam("file") MultipartFile file,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day,
            @RequestParam(defaultValue = "FRONT") Photo.Pose pose, Authentication auth) throws IOException {
        return photos.upload(users.current(auth).getId(), file.getBytes(), day, pose);
    }

    @DeleteMapping("/api/me/photos/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, Authentication auth) {
        photos.delete(users.current(auth).getId(), id);
    }

    @GetMapping("/api/me/storage")
    public QuotaService.Usage storage(Authentication auth) {
        return quota.usage(users.current(auth).getId());
    }

    /**
     * The picture itself (full or thumb). A photo id never changes content (a new photo gets a new id),
     * so the browser may keep it; "private" keeps it out of shared caches.
     */
    @GetMapping("/api/photos/{id}/{variant}")
    public ResponseEntity<byte[]> image(@PathVariable UUID id, @PathVariable String variant, Authentication auth) {
        if (!"full".equals(variant) && !"thumb".equals(variant)) {
            throw ApiException.notFound();
        }
        Photo p = photos.viewable(id, users.current(auth).getId());
        byte[] bytes = photos.read(p, "thumb".equals(variant));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(p.contentType()))
                .cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePrivate().immutable())
                .header("Content-Disposition", "inline")
                .body(bytes);
    }
}
