package fr.mbonnici.mybody365.photo;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PhotoRepository extends JpaRepository<Photo, UUID> {

    List<Photo> findByUserIdOrderByDayDescPoseAsc(UUID userId);

    Optional<Photo> findByUserIdAndDayAndPose(UUID userId, LocalDate day, Photo.Pose pose);

    boolean existsByUserIdAndDay(UUID userId, LocalDate day);
}
