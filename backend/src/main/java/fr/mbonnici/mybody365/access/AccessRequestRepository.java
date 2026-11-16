package fr.mbonnici.mybody365.access;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccessRequestRepository extends JpaRepository<AccessRequest, UUID> {

    Optional<AccessRequest> findFirstByEmailAndKindAndStatus(String email, AccessRequest.Kind kind, AccessRequest.Status status);

    List<AccessRequest> findByStatusOrderByCreatedAtDesc(AccessRequest.Status status);

    List<AccessRequest> findTop100ByStatusNotOrderByDecidedAtDesc(AccessRequest.Status status);

    long countByStatus(AccessRequest.Status status);
}
