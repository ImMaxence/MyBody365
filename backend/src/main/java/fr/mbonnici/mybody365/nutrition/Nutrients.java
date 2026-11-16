package fr.mbonnici.mybody365.nutrition;

import java.sql.ResultSet;
import java.sql.SQLException;

/** Energy and nutrients of an amount of food (per 100 g for a food, per serving for a recipe…). */
public record Nutrients(double kcal, Double proteinG, Double carbsG, Double sugarsG, Double fatG, Double satFatG, Double fiberG,
        Double saltG) {

    public static final Nutrients ZERO = new Nutrients(0, 0d, 0d, 0d, 0d, 0d, 0d, 0d);

    public Nutrients times(double f) {
        return new Nutrients(kcal * f, mul(proteinG, f), mul(carbsG, f), mul(sugarsG, f), mul(fatG, f), mul(satFatG, f),
                mul(fiberG, f), mul(saltG, f));
    }

    /** a sum where an unknown value stays unknown only if it is unknown everywhere */
    public Nutrients plus(Nutrients o) {
        return new Nutrients(kcal + o.kcal, add(proteinG, o.proteinG), add(carbsG, o.carbsG), add(sugarsG, o.sugarsG),
                add(fatG, o.fatG), add(satFatG, o.satFatG), add(fiberG, o.fiberG), add(saltG, o.saltG));
    }

    public Nutrients rounded() {
        return new Nutrients(Math.round(kcal * 10) / 10.0, r(proteinG, 10), r(carbsG, 10), r(sugarsG, 10), r(fatG, 10), r(satFatG, 10),
                r(fiberG, 10), r(saltG, 100));
    }

    /** reads kcal, protein_g, carbs_g… of the current row */
    public static Nutrients from(ResultSet rs) throws SQLException {
        return new Nutrients(rs.getDouble("kcal"), num(rs, "protein_g"), num(rs, "carbs_g"), num(rs, "sugars_g"), num(rs, "fat_g"),
                num(rs, "sat_fat_g"), num(rs, "fiber_g"), num(rs, "salt_g"));
    }

    static Double num(ResultSet rs, String col) throws SQLException {
        double v = rs.getDouble(col);
        return rs.wasNull() ? null : v;
    }

    private static Double mul(Double v, double f) {
        return v == null ? null : v * f;
    }

    private static Double add(Double a, Double b) {
        if (a == null) {
            return b;
        }
        return b == null ? a : a + b;
    }

    private static Double r(Double v, int scale) {
        return v == null ? null : Math.round(v * scale) / (double) scale;
    }
}
