package fr.mbonnici.mybody365.recipe;

import java.util.List;
import java.util.Set;

/**
 * 1.21: the fruits and vegetables of mainland France, month by month (the usual calendars of the season, such as the one of
 * the national nutrition programme, mangerbouger.fr), each with the Ciqual food that gives its vitamins (raw, per 100 g) and
 * the word its recipes are found by (RecipeLookalikes.key: « Chou de Bruxelles » finds every Brussels sprout).
 */
final class Season {

    enum Kind { VEGETABLE, FRUIT }

    /** a fruit or a vegetable: its id (the app's text for its name), the word of its recipes, its Ciqual food, its months */
    record Produce(String id, Kind kind, String word, String ciqual, Set<Integer> months) {

        String key() {
            return RecipeLookalikes.key(word);
        }
    }

    private static final Set<Integer> ALL_YEAR = Set.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);

    private static Set<Integer> from(int first, int last) {
        java.util.Set<Integer> out = new java.util.TreeSet<>();
        for (int m = first; ; m = m % 12 + 1) {
            out.add(m);
            if (m == last) {
                return Set.copyOf(out);
            }
        }
    }

    private static Produce veg(String id, String word, String ciqual, Set<Integer> months) {
        return new Produce(id, Kind.VEGETABLE, word, ciqual, months);
    }

    private static Produce fruit(String id, String word, String ciqual, Set<Integer> months) {
        return new Produce(id, Kind.FRUIT, word, ciqual, months);
    }

    static final List<Produce> ALL = List.of(
            veg("asparagus", "Asperge", "Asperge, verte, crue", from(4, 6)),
            veg("artichoke", "Artichaut", "Artichaut, cru", from(5, 9)),
            veg("eggplant", "Aubergine", "Aubergine, crue", from(6, 9)),
            veg("beetroot", "Betterave", "Betterave rouge, crue", from(7, 3)),
            veg("chard", "Blette", "Bette ou blette, côte (sans feuille), crue", from(6, 11)),
            veg("broccoli", "Brocoli", "Brocoli, cru", from(6, 11)),
            veg("carrot", "Carotte", "Carotte, crue", ALL_YEAR),
            veg("celeriac", "Céleri-rave", "Céleri-rave, cru", from(9, 3)),
            veg("cabbage", "Chou vert", "Chou vert, cru", from(10, 3)),
            veg("sprouts", "Chou de Bruxelles", "Chou de Bruxelles, cru", from(10, 2)),
            veg("cauliflower", "Chou-fleur", "Chou-fleur, cru", from(9, 4)),
            veg("redCabbage", "Chou rouge", "Chou rouge, cru", from(10, 3)),
            veg("cucumber", "Concombre", "Concombre, chair et peau, cru", from(5, 9)),
            veg("squash", "Courge", "Courge butternut (doubeurre), chair sans peau, crue", from(9, 1)),
            veg("pumpkin", "Potiron", "Potiron, cru", from(9, 12)),
            veg("zucchini", "Courgette", "Courgette, chair et peau, crue", from(6, 9)),
            veg("endive", "Endive", "Endive, crue", from(10, 4)),
            veg("spinach", "Épinard", "Épinard, cru", Set.of(3, 4, 5, 9, 10, 11)),
            veg("fennel", "Fenouil", "Fenouil, cru", from(6, 11)),
            veg("greenBean", "Haricot vert", "Haricot vert, cru", from(6, 9)),
            veg("lettuce", "Laitue", "Laitue, crue", from(4, 10)),
            veg("lambsLettuce", "Mâche", "Mâche, crue", from(10, 3)),
            veg("turnip", "Navet", "Navet, pelé, cru", from(10, 3)),
            veg("parsnip", "Panais", "Panais, cru", from(10, 3)),
            veg("peas", "Petits pois", "Petits pois, crus", from(5, 7)),
            veg("leek", "Poireau", "Poireau, cru", from(9, 4)),
            veg("pepper", "Poivron", "Poivron, vert, jaune ou rouge, cru", from(7, 9)),
            veg("radish", "Radis", "Radis rouge, cru", from(4, 7)),
            veg("salsify", "Salsifis", "Salsifis noir, ou scorsonère d'Espagne, cru", from(10, 2)),
            veg("tomato", "Tomate", "Tomate sans précision, crue (aliment moyen)", from(6, 9)),
            veg("jerusalemArtichoke", "Topinambour", "Topinambour, cru", from(10, 3)),
            veg("rhubarb", "Rhubarbe", "Rhubarbe, tige, crue", from(4, 6)),
            fruit("apricot", "Abricot", "Abricot, dénoyauté, cru", from(6, 8)),
            fruit("cherry", "Cerise", "Ceriser, chair et peau, sans noyau, crue", from(5, 7)),
            fruit("strawberry", "Fraise", "Fraise, crue", from(4, 7)),
            fruit("raspberry", "Framboise", "Framboise, crue", from(6, 9)),
            fruit("blueberry", "Myrtille", "Myrtille, crue", from(7, 9)),
            fruit("melon", "Melon", "Melon cantaloup (par ex.: Charentais), chair sans peau, sans pépins, cru", from(6, 9)),
            fruit("watermelon", "Pastèque", "Pastèque, chair sans peau, sans pépins, crue", from(7, 8)),
            fruit("peach", "Pêche", "Pêche, chair et peau, sans noyau, crue", from(6, 9)),
            fruit("plum", "Prune", "Prune, sans noyau, crue", from(7, 9)),
            fruit("fig", "Figue", "Figue, crue", from(8, 10)),
            fruit("grape", "Raisin", "Raisin cru (aliment moyen)", from(8, 10)),
            fruit("apple", "Pomme", "Pomme, chair et peau, crue", from(8, 4)),
            fruit("pear", "Poire", "Poire, chair et peau, crue", from(8, 1)),
            fruit("quince", "Coing", "Coing, cru", from(9, 11)),
            fruit("persimmon", "Kaki", "Kaki, chair et peau, cru", from(10, 12)),
            fruit("kiwi", "Kiwi", "Kiwi, chair sans peau, avec pépins, cru", from(11, 4)),
            fruit("clementine", "Clémentine", "Clémentine ou mandarine, chair sans peau, sans pépins, crue", from(11, 2)),
            fruit("orange", "Orange", "Orange, chair sans peau, sans pépins, crue", from(12, 4)),
            fruit("chestnut", "Châtaigne", "Châtaigne, crue", from(10, 12)),
            fruit("walnut", "Noix", "Noix, cerneau, séchée", from(9, 12)));

    private Season() {}

    /** what is in season that month, the vegetables first */
    static List<Produce> of(int month) {
        return ALL.stream().filter(p -> p.months().contains(month)).sorted(java.util.Comparator.comparing(Produce::kind)).toList();
    }
}
