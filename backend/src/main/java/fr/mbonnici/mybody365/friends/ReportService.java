package fr.mbonnici.mybody365.friends;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.photo.Photo;
import fr.mbonnici.mybody365.photo.PhotoAccessRule;
import fr.mbonnici.mybody365.photo.PhotoService;
import fr.mbonnici.mybody365.recipe.RecipeService;
import fr.mbonnici.mybody365.user.AppUserRepository;
import fr.mbonnici.mybody365.user.UserService;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.context.annotation.Lazy;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reports about what members share (community recipes, photos shared with a friend) and their handling.
 * A reported photo becomes visible to the admins, and to them only, until the report is handled.
 */
@Service
public class ReportService implements PhotoAccessRule {

    public record ReportInput(
            @NotNull @Pattern(regexp = "RECIPE|PHOTO") String type,
            @NotNull UUID targetId,
            @NotNull @Pattern(regexp = "INAPPROPRIATE|ILLEGAL|SPAM|OTHER") String reason,
            @Size(max = 500) String comment) {}

    public record ReportDto(UUID id, String type, UUID targetId, String reason, String comment, String status, String reporterName,
            UUID ownerId, String ownerName, String ownerEmail, Instant createdAt, String title, String thumbUrl, LocalDate photoDay) {}

    private final JdbcTemplate jdbc;
    private final RecipeService recipes;
    private final PhotoService photos;
    private final FriendService friends;
    private final UserService users;
    private final AppUserRepository userRepository;

    public ReportService(JdbcTemplate jdbc, RecipeService recipes, @Lazy PhotoService photos, FriendService friends, UserService users,
            AppUserRepository userRepository) {
        this.jdbc = jdbc;
        this.recipes = recipes;
        this.photos = photos;
        this.friends = friends;
        this.users = users;
        this.userRepository = userRepository;
    }

    /** only what the member can see can be reported */
    @Transactional
    public void report(UUID userId, ReportInput in) {
        UUID owner;
        if ("RECIPE".equals(in.type())) {
            RecipeService.RecipeRow r = recipes.viewable(in.targetId(), userId, false);
            if (r.ownerId().equals(userId)) {
                throw ApiException.badRequest("own_recipe");
            }
            owner = r.ownerId();
        } else {
            Photo p = photos.viewable(in.targetId(), userId);
            if (p.getUserId().equals(userId) || !friends.canView(p, userId)) {
                throw ApiException.notFound();
            }
            owner = p.getUserId();
        }
        try {
            jdbc.update("insert into report (id, reporter_id, target_type, target_id, owner_id, reason, comment) values (?, ?, ?, ?, ?, ?, ?)",
                    UUID.randomUUID(), userId, in.type(), in.targetId(), owner, in.reason(),
                    in.comment() == null || in.comment().isBlank() ? null : in.comment().strip());
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("already_reported");
        }
    }

    public List<ReportDto> open() {
        return jdbc.query("""
                select r.id, r.target_type, r.target_id, r.reason, r.comment, r.status, r.created_at, r.owner_id,
                  rep.display_name as reporter, o.display_name as owner_name, o.email as owner_email,
                  rc.name as recipe_name, rc.image_format, rc.image_version, p.day as photo_day
                from report r
                left join app_user rep on rep.id = r.reporter_id
                left join app_user o on o.id = r.owner_id
                left join recipe rc on r.target_type = 'RECIPE' and rc.id = r.target_id
                left join photo p on r.target_type = 'PHOTO' and p.id = r.target_id
                where r.status = 'OPEN' order by r.created_at""", (rs, i) -> {
            String type = rs.getString("target_type");
            UUID target = rs.getObject("target_id", UUID.class);
            String thumb = "PHOTO".equals(type) ? "/api/photos/" + target + "/thumb"
                    : rs.getString("image_format") == null ? null : "/api/recipes/" + target + "/image/thumb?v=" + rs.getInt("image_version");
            return new ReportDto(rs.getObject("id", UUID.class), type, target, rs.getString("reason"), rs.getString("comment"),
                    rs.getString("status"), rs.getString("reporter"), rs.getObject("owner_id", UUID.class), rs.getString("owner_name"),
                    rs.getString("owner_email"), rs.getTimestamp("created_at").toInstant(), rs.getString("recipe_name"), thumb,
                    rs.getObject("photo_day", LocalDate.class));
        });
    }

    /** nothing wrong: the report is closed, the content stays */
    @Transactional
    public ReportDto dismiss(UUID reportId, UUID adminId) {
        ReportDto r = openReport(reportId);
        close(reportId, adminId, "DISMISSED");
        return r;
    }

    /** a recipe leaves the community, a photo is deleted; every open report on it is closed */
    @Transactional
    public ReportDto act(UUID reportId, UUID adminId) {
        ReportDto r = openReport(reportId);
        if ("RECIPE".equals(r.type())) {
            recipes.setHidden(r.targetId(), true);
        } else if (r.ownerId() != null) {
            try {
                photos.delete(r.ownerId(), r.targetId());
            } catch (ApiException e) {
                // already deleted by its owner
            }
        }
        jdbc.update("update report set status = 'ACTIONED', handled_at = ?, handled_by = ? where target_id = ? and status = 'OPEN'",
                Timestamp.from(Instant.now()), adminId, r.targetId());
        return r;
    }

    /** an admin sees a photo only while a report on it waits to be handled */
    @Override
    public boolean canView(Photo photo, UUID viewerId) {
        if (jdbc.queryForList("select 1 from report where target_type = 'PHOTO' and target_id = ? and status = 'OPEN'", Integer.class,
                photo.getId()).isEmpty()) {
            return false;
        }
        return userRepository.findById(viewerId).map(users::isAdmin).orElse(false);
    }

    private ReportDto openReport(UUID id) {
        return open().stream().filter(r -> r.id().equals(id)).findFirst().orElseThrow(ApiException::notFound);
    }

    private void close(UUID id, UUID adminId, String status) {
        jdbc.update("update report set status = ?, handled_at = ?, handled_by = ? where id = ?", status, Timestamp.from(Instant.now()),
                adminId, id);
    }
}
