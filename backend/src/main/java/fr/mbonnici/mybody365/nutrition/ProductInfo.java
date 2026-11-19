package fr.mbonnici.mybody365.nutrition;

/**
 * 1.13: what Open Food Facts says of a product besides its nutrients, to tell twenty « Biscoff » apart and to judge it:
 * its size on the shelf (« 400 g », « 33 cl »), its generic name (« Pâte à tartiner aux spéculoos »), its food group
 * (PNNS, in English: « Biscuits and cakes »), how processed it is (NOVA 1 to 4), its additives and sweeteners, its share of
 * fruit, vegetables and legumes, and how many people scanned it (its popularity). Every field may be missing.
 */
public record ProductInfo(String quantity, String genericName, String pnns, Integer nova, Integer additives, boolean sweeteners,
        Double fruitVeg, Integer scans) {

    public static final ProductInfo NONE = new ProductInfo(null, null, null, null, null, false, null, null);

    /** e950 to e969: acesulfame K, aspartame, cyclamate, saccharin, sucralose, steviol glycosides, the polyols… */
    public static boolean sweeteners(String additivesTags) {
        if (additivesTags == null) {
            return false;
        }
        for (String t : additivesTags.split(",")) {
            String tag = t.strip().toLowerCase(java.util.Locale.ROOT);
            if (tag.matches("en:e9[56]\\d.*")) {
                return true;
            }
        }
        return false;
    }

    /** « 1 L », « 6 x 33 cl », « 500ml » → the millilitres of one unit; null when the size is not a volume */
    public static Integer millilitres(String quantity) {
        if (quantity == null) {
            return null;
        }
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("(\\d+(?:[.,]\\d+)?)\\s*(ml|cl|dl|l|litres?|liters?)(?![a-z])", java.util.regex.Pattern.CASE_INSENSITIVE)
                .matcher(quantity);
        if (!m.find()) {
            return null;
        }
        double v = Double.parseDouble(m.group(1).replace(',', '.'));
        String unit = m.group(2).toLowerCase(java.util.Locale.ROOT);
        double ml = switch (unit) {
            case "ml" -> v;
            case "cl" -> v * 10;
            case "dl" -> v * 100;
            default -> v * 1000;
        };
        return ml >= 20 && ml <= 5000 ? (int) Math.round(ml) : null;
    }
}
