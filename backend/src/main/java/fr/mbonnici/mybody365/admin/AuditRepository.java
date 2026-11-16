package fr.mbonnici.mybody365.admin;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface AuditRepository extends JpaRepository<AuditEntry, Long> {

    /** newest first, keyset pagination: pass the last id seen (Long.MAX_VALUE for the first page) */
    @Query("select a from AuditEntry a where a.id < :before order by a.id desc")
    List<AuditEntry> page(long before, Pageable pageable);
}
