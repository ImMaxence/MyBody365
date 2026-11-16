package fr.mbonnici.mybody365.auth;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface AccountLinkRepository extends JpaRepository<AccountLink, UUID> {

    Optional<AccountLink> findByTokenHash(String tokenHash);

    List<AccountLink> findByUserIdOrderByCreatedAtDesc(UUID userId);

    @Query("select l from AccountLink l where l.usedAt is null and l.revokedAt is null and l.expiresAt > :now")
    List<AccountLink> findActive(Instant now);

    /** the last 100 links, all states, for the admin "Links" list */
    List<AccountLink> findTop100ByOrderByCreatedAtDesc();
}
