package fr.mbonnici.mybody365.friends;

import fr.mbonnici.mybody365.friends.FriendService.FriendDto;
import fr.mbonnici.mybody365.friends.FriendService.Invite;
import fr.mbonnici.mybody365.friends.FriendService.SharedPhoto;
import fr.mbonnici.mybody365.friends.ReportService.ReportInput;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class FriendController {

    public record FriendsView(List<FriendDto> friends, List<SharedPhoto> sharedWithMe) {}

    private final FriendService friends;
    private final ReportService reports;
    private final UserService users;

    public FriendController(FriendService friends, ReportService reports, UserService users) {
        this.friends = friends;
        this.reports = reports;
        this.users = users;
    }

    @GetMapping("/api/me/friends")
    public FriendsView list(Authentication auth) {
        UUID me = users.current(auth).getId();
        return new FriendsView(friends.list(me), friends.sharedWithMe(me));
    }

    @PostMapping("/api/me/friends/invite")
    public Invite invite(Authentication auth) {
        return friends.invite(users.current(auth).getId());
    }

    @PostMapping("/api/me/friends/accept")
    public FriendDto accept(@RequestBody Map<String, String> body, Authentication auth) {
        return friends.accept(users.current(auth).getId(), body.get("token"));
    }

    @DeleteMapping("/api/me/friends/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@PathVariable UUID id, Authentication auth) {
        friends.remove(users.current(auth).getId(), id);
    }

    @PostMapping("/api/me/friends/{id}/nudge")
    public Map<String, Integer> nudge(@PathVariable UUID id, Authentication auth) {
        return Map.of("sent", friends.nudge(users.current(auth).getId(), id));
    }

    @GetMapping("/api/me/photos/{id}/shares")
    public List<UUID> shares(@PathVariable UUID id, Authentication auth) {
        return friends.sharesOf(users.current(auth).getId(), id);
    }

    @PutMapping("/api/me/photos/{id}/shares/{friendId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void share(@PathVariable UUID id, @PathVariable UUID friendId, Authentication auth) {
        friends.share(users.current(auth).getId(), id, friendId);
    }

    @DeleteMapping("/api/me/photos/{id}/shares/{friendId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unshare(@PathVariable UUID id, @PathVariable UUID friendId, Authentication auth) {
        friends.unshare(users.current(auth).getId(), id, friendId);
    }

    @PostMapping("/api/reports")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void report(@Valid @RequestBody ReportInput body, Authentication auth) {
        reports.report(users.current(auth).getId(), body);
    }
}
