package fr.mbonnici.mybody365.auth;

import fr.mbonnici.mybody365.photo.Photo;
import fr.mbonnici.mybody365.photo.PhotoService;
import fr.mbonnici.mybody365.tracking.TrackingService;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.AppUserRepository;
import jakarta.persistence.EntityManager;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Ellipse2D;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * <b>Local only</b> (behind the same guard as the local sign-in): a demo account filled with two months
 * of life, to try every screen at once. Weigh-ins with a real curve and a flame (with frozen days),
 * silhouette photos that slim down over time (before / after, time-lapse), three weeks of meals, glasses
 * of water, a saved timer, a recipe; three friends with their flames, one sharing a photo and a recipe,
 * and a friend request waiting. A new account each time, so the dates always match today.
 */
@Component
public class DemoSeed {

    private record Dish(String name, double kcal, double p, double c, double f, double sugars, double fiber, double sat, double salt,
            String grade) {}

    private static final List<Dish> BREAKFAST = List.of(
            new Dish("Skyr et flocons d'avoine", 320, 22, 42, 6, 12, 5, 2, 0.2, "A"),
            new Dish("Tartines beurre et confiture", 380, 8, 55, 14, 25, 3, 8, 0.6, "D"),
            new Dish("Œufs brouillés et pain complet", 410, 24, 30, 20, 3, 5, 6, 1.1, "B"));
    private static final List<Dish> LUNCH = List.of(
            new Dish("Bowl poulet, riz et brocolis", 560, 42, 62, 14, 4, 6, 3, 1.2, "A"),
            new Dish("Salade de lentilles et feta", 480, 24, 48, 18, 6, 11, 7, 1.4, "A"),
            new Dish("Menu burger frites", 1080, 40, 110, 52, 12, 6, 18, 3.2, "D"),
            new Dish("Sandwich jambon emmental", 520, 28, 52, 20, 5, 3, 10, 2.6, "C"));
    private static final List<Dish> DINNER = List.of(
            new Dish("Saumon et pâtes complètes", 620, 38, 62, 22, 4, 8, 4, 0.8, "B"),
            new Dish("Pizza margherita", 850, 34, 100, 32, 8, 5, 14, 3.4, "C"),
            new Dish("Soupe de légumes et tartine", 420, 14, 58, 12, 12, 9, 3, 1.8, "A"),
            new Dish("Kebab frites", 980, 42, 96, 46, 7, 6, 15, 3.6, "D"));
    private static final List<Dish> SNACK = List.of(
            new Dish("Pomme", 78, 0.4, 18, 0.3, 14, 3, 0, 0, "A"),
            new Dish("Yaourt grec", 140, 9, 6, 9, 6, 0, 6, 0.1, "B"),
            new Dish("Carré de chocolat noir", 110, 1.5, 8, 8, 6, 2, 5, 0, "D"));

    private final JdbcTemplate jdbc;
    private final AppUserRepository users;
    private final PhotoService photos;
    private final EntityManager em;

    DemoSeed(JdbcTemplate jdbc, AppUserRepository users, PhotoService photos, EntityManager em) {
        this.em = em;
        this.jdbc = jdbc;
        this.users = users;
        this.photos = photos;
    }

    /** the demo account (Léa), with everything; friends with the admin account too when there is one */
    @Transactional
    public AppUser create(String adminEmail) {
        String tag = UUID.randomUUID().toString().substring(0, 6);
        LocalDate today = TrackingService.today();
        AppUser lea = member("demo+" + tag + "@localhost", "Léa");
        jdbc.update("update app_user set water_goal = 8 where id = ?", lea.getId());
        lea.setWaterGoal(8);

        // two months: from 78 kg towards 68, a few days missed (the flame keeps going with its freezes)
        profile(lea.getId(), "FEMALE", today.minusDays(60), 78.0, 68.0, 0.5);
        for (int i = 60; i >= 0; i--) {
            if (i % 11 == 5) {
                continue;
            }
            double kg = 78.0 - 0.075 * (60 - i) + Math.sin(i * 1.7) * 0.35 + Math.cos(i * 0.6) * 0.15;
            Double waist = i % 7 == 0 ? Math.round((92 - (60 - i) * 0.1) * 10) / 10.0 : null;
            jdbc.update("insert into body_log (user_id, day, weight_kg, waist_cm) values (?, ?, ?, ?)", lea.getId(), today.minusDays(i),
                    Math.round(kg * 10) / 10.0, waist);
        }

        // photos: a silhouette that slims down, front every two weeks, side and back now and then
        for (int i : new int[] {60, 46, 32, 18, 4, 0}) {
            double slim = (60 - i) / 60.0;
            photos.upload(lea.getId(), silhouette(slim, Photo.Pose.FRONT, today.minusDays(i)), today.minusDays(i), Photo.Pose.FRONT);
        }
        for (int i : new int[] {60, 30, 0}) {
            photos.upload(lea.getId(), silhouette((60 - i) / 60.0, Photo.Pose.SIDE, today.minusDays(i)), today.minusDays(i), Photo.Pose.SIDE);
        }

        // three weeks of meals, heavier at the weekend; today, breakfast and lunch only
        for (int i = 21; i >= 0; i--) {
            LocalDate d = today.minusDays(i);
            boolean weekend = d.getDayOfWeek().getValue() >= 6;
            meal(lea.getId(), d, "BREAKFAST", BREAKFAST.get(i % BREAKFAST.size()));
            meal(lea.getId(), d, "LUNCH", weekend ? LUNCH.get(2) : LUNCH.get(i % 2 == 0 ? 0 : (i % 3 == 0 ? 3 : 1)));
            if (i == 0) {
                continue;
            }
            meal(lea.getId(), d, "DINNER", weekend ? DINNER.get(i % 2 == 0 ? 1 : 3) : DINNER.get(i % 3 == 0 ? 2 : 0));
            meal(lea.getId(), d, "SNACK", SNACK.get(i % SNACK.size()));
            jdbc.update("insert into water_log (user_id, day, glasses) values (?, ?, ?)", lea.getId(), d, 5 + (i * 7) % 5);
        }
        jdbc.update("insert into water_log (user_id, day, glasses) values (?, ?, 3)", lea.getId(), today);
        jdbc.update("insert into timer_preset (id, user_id, name, work_s, rest_s, rounds) values (?, ?, 'Gainage du soir', 40, 20, 5)",
                UUID.randomUUID(), lea.getId());
        recipe(lea.getId(), "Bowl poulet, riz et brocolis", "LUNCH", 560, "FRIENDS",
                "150 g de blanc de poulet\n200 g de riz complet cuit\n150 g de brocolis vapeur\n1 c. à s. de sauce soja");

        // friends: their flames, a photo and a recipe shared with Léa, and a request waiting
        AppUser hugo = friend(lea, "Hugo", "MALE", 12, false, today);
        AppUser ines = friend(lea, "Inès", "FEMALE", 61, true, today);
        friend(lea, "Camille", "FEMALE", 34, true, today);
        var shared = photos.upload(hugo.getId(), silhouette(0.4, Photo.Pose.FRONT, today.minusDays(2)), today.minusDays(2), Photo.Pose.FRONT);
        // the photos are saved through JPA: written to the database before plain SQL points to one of them
        em.flush();
        jdbc.update("insert into photo_share (photo_id, friend_id) values (?, ?)", shared.id(), lea.getId());
        recipe(ines.getId(), "Overnight oats à la banane", "BREAKFAST", 390, "FRIENDS",
                "50 g de flocons d'avoine\n150 g de lait\n1 banane\n1 c. à c. de miel");
        AppUser sam = member("demo+" + tag + "-sam@localhost", "Sam");
        jdbc.update("insert into friend_request (from_id, to_id) values (?, ?)", sam.getId(), lea.getId());
        users.findByEmail(adminEmail).ifPresent(admin -> befriend(lea, admin));
        return lea;
    }

    private AppUser member(String email, String name) {
        AppUser u = AppUser.create(email, name, AppUser.Role.USER);
        u.setAdultConfirmedAt(Instant.now());
        u.setHealthConsentAt(Instant.now());
        return users.saveAndFlush(u);
    }

    private AppUser friend(AppUser lea, String name, String sex, int days, boolean weighedToday, LocalDate today) {
        AppUser f = member("demo+" + UUID.randomUUID().toString().substring(0, 6) + "-" + name.toLowerCase().replace("è", "e") + "@localhost", name);
        profile(f.getId(), sex, today.minusDays(days), 72, 65, 0.5);
        for (int i = days; i >= (weighedToday ? 0 : 1); i--) {
            jdbc.update("insert into body_log (user_id, day, weight_kg) values (?, ?, ?)", f.getId(), today.minusDays(i),
                    Math.round((72 - (days - i) * 0.05) * 10) / 10.0);
        }
        befriend(lea, f);
        return f;
    }

    private void befriend(AppUser a, AppUser b) {
        UUID x = a.getId().toString().compareTo(b.getId().toString()) < 0 ? a.getId() : b.getId();
        UUID y = x.equals(a.getId()) ? b.getId() : a.getId();
        jdbc.update("insert into friendship (user_a, user_b) values (?, ?) on conflict do nothing", x, y);
    }

    private void profile(UUID userId, String sex, LocalDate start, double startKg, double goalKg, double rate) {
        jdbc.update("""
                insert into body_profile (user_id, sex, birth_date, height_cm, activity_level, start_weight_kg, start_date, goal_weight_kg,
                  weekly_rate_kg) values (?, ?, ?, 168, 'LIGHT', ?, ?, ?, ?)""",
                userId, sex, LocalDate.of(1995, 5, 14), startKg, start, goalKg, rate);
    }

    private void meal(UUID userId, LocalDate day, String slot, Dish d) {
        jdbc.update("""
                insert into meal_entry (id, user_id, day, slot, name, servings, kcal, protein_g, carbs_g, fat_g, sugars_g, fiber_g, sat_fat_g,
                  salt_g, nutriscore, created_at) values (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                UUID.randomUUID(), userId, day, slot, d.name(), d.kcal(), d.p(), d.c(), d.f(), d.sugars(), d.fiber(), d.sat(), d.salt(),
                d.grade(), Timestamp.from(day.atTime(switch (slot) {
                    case "BREAKFAST" -> 8;
                    case "LUNCH" -> 12;
                    case "DINNER" -> 20;
                    default -> 16;
                }, 0).toInstant(ZoneOffset.UTC)));
    }

    private void recipe(UUID owner, String name, String type, double kcal, String visibility, String lines) {
        jdbc.update("""
                insert into recipe (id, owner_id, name, type, servings, notes, kcal, protein_g, carbs_g, fat_g, visibility, shared,
                  manual_nutrition, ingredient_lines) values (?, ?, ?, ?, 2, ?, ?, ?, ?, ?, ?, false, true, ?)""",
                UUID.randomUUID(), owner, name, type, "1. Préparer les ingrédients\n2. Assembler et servir", kcal, kcal * 0.075, kcal * 0.11,
                kcal * 0.035, visibility, lines);
    }

    /** a calm studio picture: a figure whose waist narrows as {@code slim} goes from 0 to 1, and the date */
    static byte[] silhouette(double slim, Photo.Pose pose, LocalDate day) {
        int w = 900;
        int h = 1200;
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setPaint(new GradientPaint(0, 0, new Color(236, 228, 218), 0, h, new Color(206, 196, 184)));
            g.fillRect(0, 0, w, h);
            g.setColor(new Color(0, 0, 0, 28));
            g.fill(new Ellipse2D.Double(w / 2.0 - 190, h - 170, 380, 60));
            Color skin = new Color(196, 142, 112);
            Color top = new Color(48, 52, 64);
            Color shorts = new Color(70, 92, 140);
            double side = pose == Photo.Pose.SIDE ? 0.62 : 1;
            double body = (1.0 - 0.18 * slim) * side;
            double cx = w / 2.0;
            // legs, arms, torso, head
            g.setColor(skin);
            g.fill(new RoundRectangle2D.Double(cx - 95 * body, 720, 80 * Math.max(body, 0.75), 380, 60, 60));
            g.fill(new RoundRectangle2D.Double(cx + 95 * body - 80 * Math.max(body, 0.75), 720, 80 * Math.max(body, 0.75), 380, 60, 60));
            if (pose != Photo.Pose.SIDE) {
                g.fill(new RoundRectangle2D.Double(cx - 230 * body - 10, 330, 62, 330, 60, 60));
                g.fill(new RoundRectangle2D.Double(cx + 230 * body - 52, 330, 62, 330, 60, 60));
            }
            g.setColor(top);
            g.fill(new RoundRectangle2D.Double(cx - 175 * body, 300, 350 * body, 300, 120, 120));
            g.setColor(skin);
            g.fill(new RoundRectangle2D.Double(cx - 160 * body, 560, 320 * body, 120, 90, 90));
            g.setColor(shorts);
            g.fill(new RoundRectangle2D.Double(cx - 170 * body, 650, 340 * body, 170, 70, 70));
            g.setColor(skin);
            g.fill(new Ellipse2D.Double(cx - 80, 120, 160, 190));
            g.fill(new RoundRectangle2D.Double(cx - 34, 280, 68, 50, 20, 20));
            g.setColor(new Color(60, 44, 36));
            g.fill(new Ellipse2D.Double(cx - 86, 100, 172, 110));
            // a frame mark, as the camera grid would show
            g.setColor(new Color(255, 255, 255, 90));
            g.setStroke(new BasicStroke(2f));
            g.drawLine(w / 2, 40, w / 2, h - 40);
            g.setColor(new Color(40, 34, 30, 170));
            g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 34));
            g.drawString(day.toString(), 40, h - 50);
        } finally {
            g.dispose();
        }
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(img, "png", out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
