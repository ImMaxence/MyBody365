package fr.mbonnici.mybody365.tracking;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BodyLogRepository extends JpaRepository<BodyLog, BodyLog.Key> {

    List<BodyLog> findByUserIdOrderByDayAsc(UUID userId);
}
