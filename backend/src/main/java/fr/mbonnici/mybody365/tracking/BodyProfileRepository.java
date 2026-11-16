package fr.mbonnici.mybody365.tracking;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BodyProfileRepository extends JpaRepository<BodyProfile, UUID> {}
