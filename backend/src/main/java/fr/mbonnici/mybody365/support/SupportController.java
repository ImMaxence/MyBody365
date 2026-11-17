package fr.mbonnici.mybody365.support;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.support.ErrorLogService.ErrorDto;
import fr.mbonnici.mybody365.support.ErrorLogService.Source;
import fr.mbonnici.mybody365.support.FeedbackService.FeedbackDto;
import fr.mbonnici.mybody365.support.FeedbackService.Kind;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.AppUserRepository;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * A word to the creator from the app (ideas, bugs), the errors the phones run into, and both lists for
 * the admins, who archive what they have handled.
 */
@RestController
public class SupportController {

    public record FeedbackInput(@NotNull Kind kind, @NotBlank @Size(max = 2000) String message, @Size(max = 40) String version) {}

    /** an error seen by the app on a phone (cut to size here, never refused for its length) */
    public record ErrorInput(@NotBlank @Size(max = 4000) String message, @Size(max = 40000) String detail, @Size(max = 2000) String path,
            @Size(max = 40) String version) {}

    private final FeedbackService feedback;
    private final ErrorLogService errors;
    private final UserService users;
    private final AppUserRepository repository;

    public SupportController(FeedbackService feedback, ErrorLogService errors, UserService users, AppUserRepository repository) {
        this.feedback = feedback;
        this.errors = errors;
        this.users = users;
        this.repository = repository;
    }

    @PostMapping("/api/me/feedback")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void send(@Valid @RequestBody FeedbackInput body, Authentication auth, HttpServletRequest req) {
        if (body.message().strip().length() < 3) {
            throw ApiException.badRequest("feedback_too_short");
        }
        feedback.send(users.current(auth), body.kind(), body.message(), body.version(), req.getHeader("User-Agent"));
    }

    /** open to signed-out visitors too (an error on the sign-in screen); limited per address */
    @PostMapping("/api/errors")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void error(@Valid @RequestBody ErrorInput body, Authentication auth, HttpServletRequest req) {
        UUID user = null;
        if (auth != null && auth.isAuthenticated() && !(auth instanceof AnonymousAuthenticationToken)) {
            user = repository.findByEmail(auth.getName()).map(AppUser::getId).orElse(null);
        }
        errors.record(Source.APP, body.message(), body.detail(), body.path(), body.version(), req.getHeader("User-Agent"), user);
    }

    @GetMapping("/api/admin/feedback")
    public List<FeedbackDto> feedback(@RequestParam(defaultValue = "false") boolean archived) {
        return feedback.list(archived, 200);
    }

    @PostMapping("/api/admin/feedback/{id}/archive")
    public List<FeedbackDto> archiveFeedback(@PathVariable UUID id) {
        if (!feedback.archive(id)) {
            throw ApiException.notFound();
        }
        return feedback.list(false, 200);
    }

    @GetMapping("/api/admin/errors")
    public List<ErrorDto> errors(@RequestParam(defaultValue = "false") boolean archived) {
        return errors.list(archived, 200);
    }

    @PostMapping("/api/admin/errors/{id}/archive")
    public List<ErrorDto> archiveError(@PathVariable UUID id) {
        if (!errors.archive(id)) {
            throw ApiException.notFound();
        }
        return errors.list(false, 200);
    }

    @PostMapping("/api/admin/errors/archive-all")
    public List<ErrorDto> archiveAllErrors() {
        errors.archiveAll();
        return errors.list(false, 200);
    }
}
