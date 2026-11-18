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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class FriendController {

    public record FriendsView(List<FriendDto> friends, List<SharedPhoto> sharedWithMe) {}

    private final FriendService friends;
    private final ReportService reports;
    private final UserService users;
    private final FriendPosts posts;
    private final Challenges challenges;

    public FriendController(FriendService friends, ReportService reports, UserService users, FriendPosts posts, Challenges challenges) {
        this.friends = friends;
        this.reports = reports;
        this.users = users;
        this.posts = posts;
        this.challenges = challenges;
    }

    // ── challenges between friends (1.9) ─────────────────────────────────────

    @GetMapping("/api/me/challenges")
    public List<Challenges.ChallengeDto> myChallenges(Authentication auth) {
        return challenges.mine(users.current(auth).getId());
    }

    @PostMapping("/api/me/challenges")
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public Challenges.ChallengeDto createChallenge(@jakarta.validation.Valid @RequestBody Challenges.CreateInput body, Authentication auth) {
        return challenges.create(users.current(auth).getId(), body);
    }

    @PostMapping("/api/me/challenges/{id}/join")
    public Challenges.ChallengeDto joinChallenge(@PathVariable UUID id, Authentication auth) {
        return challenges.respond(users.current(auth).getId(), id, true);
    }

    @PostMapping("/api/me/challenges/{id}/decline")
    public Challenges.ChallengeDto declineChallenge(@PathVariable UUID id, Authentication auth) {
        return challenges.respond(users.current(auth).getId(), id, false);
    }

    /** the owner calls it off, a member leaves it */
    @DeleteMapping("/api/me/challenges/{id}")
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void leaveChallenge(@PathVariable UUID id, Authentication auth) {
        challenges.leave(users.current(auth).getId(), id);
    }

    // ── what one shows one's friends (1.9) ───────────────────────────────────

    public record ShareInput(FriendPosts.Kind kind, Boolean weights, java.time.LocalDate day, Boolean preview, UUID milestoneId) {}

    @PostMapping("/api/me/posts")
    public FriendPosts.PostDto share(@RequestBody ShareInput body, Authentication auth) {
        UUID me = users.current(auth).getId();
        if (body == null || body.kind() == null) {
            throw fr.mbonnici.mybody365.common.ApiException.badRequest("validation_failed");
        }
        boolean weights = Boolean.TRUE.equals(body.weights());
        if (Boolean.TRUE.equals(body.preview())) {
            return posts.preview(me, body.kind(), weights, body.day(), body.milestoneId());
        }
        return switch (body.kind()) {
            case PROGRESS -> posts.shareProgress(me, weights);
            case DAY -> posts.shareDay(me, body.day());
            case MILESTONE -> posts.shareMilestone(me, body.milestoneId(), weights);
        };
    }

    @GetMapping("/api/me/posts")
    public List<FriendPosts.PostDto> myPosts(Authentication auth) {
        return posts.mine(users.current(auth).getId());
    }

    @DeleteMapping("/api/me/posts/{id}")
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void unshare(@PathVariable UUID id, Authentication auth) {
        posts.delete(users.current(auth).getId(), id);
    }

    @GetMapping("/api/friends/posts")
    public List<FriendPosts.PostDto> friendsPosts(Authentication auth) {
        return posts.ofFriends(users.current(auth).getId());
    }

    @PutMapping("/api/friends/posts/{id}/cheer")
    public FriendPosts.PostDto cheer(@PathVariable UUID id, Authentication auth) {
        return posts.cheer(users.current(auth).getId(), id);
    }

    @DeleteMapping("/api/friends/posts/{id}/cheer")
    public FriendPosts.PostDto uncheer(@PathVariable UUID id, Authentication auth) {
        return posts.uncheer(users.current(auth).getId(), id);
    }

    @GetMapping("/api/me/friends")
    public FriendsView list(Authentication auth) {
        UUID me = users.current(auth).getId();
        return new FriendsView(friends.list(me), friends.sharedWithMe(me));
    }

    /** a member by their exact username (rate-limited: see RateLimitFilter) */
    @GetMapping("/api/me/friends/search")
    public FriendService.MemberDto search(@RequestParam String username, Authentication auth) {
        return friends.find(users.current(auth).getId(), username);
    }

    /** usernames starting with what was typed (rate-limited, members who accept it only) */
    @GetMapping("/api/me/friends/suggest")
    public List<FriendService.MemberDto> suggest(@RequestParam String q, Authentication auth) {
        return friends.suggest(users.current(auth).getId(), q);
    }

    @GetMapping("/api/me/friends/requests")
    public FriendService.Requests requests(Authentication auth) {
        return friends.requests(users.current(auth).getId());
    }

    @PostMapping("/api/me/friends/requests")
    public Map<String, String> request(@RequestBody Map<String, String> body, Authentication auth) {
        return Map.of("relation", friends.request(users.current(auth).getId(), body.get("username")).name());
    }

    @PostMapping("/api/me/friends/requests/{id}/accept")
    public FriendDto acceptRequest(@PathVariable UUID id, Authentication auth) {
        return friends.acceptRequest(users.current(auth).getId(), id);
    }

    /** declines a request received, or withdraws one sent */
    @DeleteMapping("/api/me/friends/requests/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void dropRequest(@PathVariable UUID id, Authentication auth) {
        friends.dropRequest(users.current(auth).getId(), id);
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
