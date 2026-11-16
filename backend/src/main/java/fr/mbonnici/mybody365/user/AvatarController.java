package fr.mbonnici.mybody365.user;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.friends.FriendService;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** A member's own picture, for whoever may see it: themselves, their friends, who they asked, an admin. */
@RestController
public class AvatarController {

    private final UserService users;
    private final AppUserRepository repository;
    private final AvatarService avatars;
    private final FriendService friends;

    public AvatarController(UserService users, AppUserRepository repository, AvatarService avatars, FriendService friends) {
        this.users = users;
        this.repository = repository;
        this.avatars = avatars;
        this.friends = friends;
    }

    /** the URL carries the version, so the browser may keep the picture; a replaced one is gone (404) */
    @GetMapping("/api/users/{id}/avatar")
    public ResponseEntity<byte[]> avatar(@PathVariable UUID id, @RequestParam(defaultValue = "0") int v, Authentication auth) {
        AppUser me = users.current(auth);
        AppUser owner = repository.findById(id).orElseThrow(ApiException::notFound);
        if (!users.isAdmin(me) && !friends.canSeePicture(owner.getId(), me.getId())) {
            throw ApiException.notFound();
        }
        byte[] bytes = avatars.get(owner, v);
        boolean webp = bytes.length > 12 && bytes[0] == 'R' && bytes[8] == 'W';
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(webp ? "image/webp" : "image/jpeg"))
                .cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePrivate().immutable())
                .header("Content-Disposition", "inline")
                .body(bytes);
    }
}
