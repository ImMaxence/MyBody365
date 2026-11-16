package fr.mbonnici.mybody365.access;

import fr.mbonnici.mybody365.common.Emails;
import fr.mbonnici.mybody365.config.AppProperties;
import fr.mbonnici.mybody365.config.ClientIp;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The public "request access" / "I lost access" form of the sign-in screen. The answer is always the
 * same 202, whether the address is known or not, so the form tells nobody who has an account.
 * Limited to 5 requests per hour and per IP (RateLimitFilter) and guarded by a honeypot field.
 */
@RestController
@RequestMapping("/api/access-requests")
public class AccessRequestController {

    private static final Logger log = LoggerFactory.getLogger(AccessRequestController.class);

    public record Input(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(max = 80) String name,
            @Size(max = 500) String message,
            @NotNull AccessRequest.Kind kind,
            /** honeypot: a hidden field that only robots fill in */
            @Size(max = 200) String website) {}

    private final AccessRequestRepository requests;
    private final AppProperties props;

    public AccessRequestController(AccessRequestRepository requests, AppProperties props) {
        this.requests = requests;
        this.props = props;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Transactional
    public void submit(@Valid @RequestBody Input input, HttpServletRequest request) {
        if (input.website() != null && !input.website().isBlank()) {
            log.info("Access request dropped by the honeypot");
            return;
        }
        String email = Emails.normalize(input.email());
        String name = input.name().strip();
        String message = input.message() == null || input.message().isBlank() ? null : input.message().strip();
        String ip = ClientIp.resolve(request, props.trustProxy());
        requests.findFirstByEmailAndKindAndStatus(email, input.kind(), AccessRequest.Status.PENDING)
                .ifPresentOrElse(existing -> existing.refresh(name, message, ip),
                        () -> requests.save(new AccessRequest(email, name, message, input.kind(), ip)));
        log.info("Access request ({}) from {}", input.kind(), email);
    }
}
