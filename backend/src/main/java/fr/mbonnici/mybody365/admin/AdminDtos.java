package fr.mbonnici.mybody365.admin;

import fr.mbonnici.mybody365.access.AccessRequest;
import fr.mbonnici.mybody365.auth.AccountLink;
import fr.mbonnici.mybody365.user.AppUser;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class AdminDtos {

    private AdminDtos() {}

    public record Summary(long users, long admins, long pendingRequests, long activeLinks) {}

    public record LinkDto(
            UUID id,
            String kind,
            String state,
            UUID userId,
            String userEmail,
            String userName,
            String createdBy,
            Instant createdAt,
            Instant expiresAt,
            Instant usedAt,
            Instant revokedAt,
            /** only in the answer that creates the link: it is never shown again */
            String url) {}

    public record GoogleDto(boolean linked, String email) {}

    public record UserDto(
            UUID id,
            String email,
            String displayName,
            String avatarUrl,
            String role,
            String status,
            /** listed in ADMIN_EMAILS: always admin, cannot be demoted, suspended or deleted */
            boolean envAdmin,
            boolean self,
            GoogleDto google,
            int passkeys,
            boolean onboarded,
            Instant createdAt,
            Instant lastLoginAt,
            String lastLoginMethod,
            LinkDto activeLink,
            long storageUsedBytes,
            /** null: the default quota */
            Integer storageQuotaMb,
            int defaultQuotaMb) {}

    public record CreateUser(@NotBlank @Email @Size(max = 254) String email, @Size(max = 80) String displayName) {}

    /** storageQuotaMb: -1 goes back to the default quota */
    public record UpdateUser(AppUser.Role role, AppUser.Status status, Integer storageQuotaMb) {}

    public record CreateLink(@NotNull AccountLink.Kind kind) {}

    public record Created(UserDto user, LinkDto link) {}

    public record RequestDto(
            UUID id,
            String email,
            String name,
            String message,
            String kind,
            String status,
            Instant createdAt,
            Instant decidedAt,
            String decidedBy,
            /** an account with this address already exists */
            boolean existingUser) {}

    public record Decision(RequestDto request, UserDto user, LinkDto link) {}

    public record AuditDto(
            long id,
            String actorEmail,
            String action,
            String targetType,
            String targetId,
            String targetLabel,
            String details,
            String ip,
            Instant createdAt) {}

    static RequestDto request(AccessRequest r, String decidedBy, boolean existingUser) {
        return new RequestDto(r.getId(), r.getEmail(), r.getName(), r.getMessage(), r.getKind().name(), r.getStatus().name(),
                r.getCreatedAt(), r.getDecidedAt(), decidedBy, existingUser);
    }

    static AuditDto audit(AuditEntry a) {
        return new AuditDto(a.getId(), a.getActorEmail(), a.getAction(), a.getTargetType(), a.getTargetId(), a.getTargetLabel(),
                a.getDetails(), a.getIp(), a.getCreatedAt());
    }
}
