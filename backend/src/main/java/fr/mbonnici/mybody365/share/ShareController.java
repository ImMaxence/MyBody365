package fr.mbonnici.mybody365.share;

import fr.mbonnici.mybody365.share.ShareLinks.CreateInput;
import fr.mbonnici.mybody365.share.ShareLinks.Created;
import fr.mbonnici.mybody365.share.ShareLinks.LinkDto;
import fr.mbonnici.mybody365.share.ShareLinks.Shared;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 1.19: the read-only links for a coach or a dietitian (ShareLinks): made, listed and revoked by the member, opened by anyone holding one */
@RestController
public class ShareController {

    private final ShareLinks links;
    private final UserService users;

    public ShareController(ShareLinks links, UserService users) {
        this.links = links;
        this.users = users;
    }

    @GetMapping("/api/me/share-links")
    public List<LinkDto> list(Authentication auth) {
        return links.list(users.current(auth).getId());
    }

    @PostMapping("/api/me/share-links")
    @ResponseStatus(HttpStatus.CREATED)
    public Created create(@Valid @RequestBody CreateInput body, Authentication auth) {
        return links.create(users.current(auth).getId(), body);
    }

    @DeleteMapping("/api/me/share-links/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@PathVariable UUID id, Authentication auth) {
        links.revoke(users.current(auth).getId(), id);
    }

    /** public: the token is the access; never cached, never indexed */
    @GetMapping("/api/shared/{token}")
    public Shared open(@PathVariable String token, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Robots-Tag", "noindex, nofollow");
        response.setHeader("Referrer-Policy", "no-referrer");
        return links.open(token);
    }
}
