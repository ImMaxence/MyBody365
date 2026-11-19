package fr.mbonnici.mybody365.nutrition;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Consumer;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

/**
 * Streaming reader for the Ciqual XML tables (alim, alim_grp, compo): the composition file is ~70 MB,
 * it is read element by element, never loaded whole. DTDs and external entities are refused.
 */
public final class CiqualParser {

    public record Alim(String code, String nameFr, String nameEn, String group, String subGroup) {}

    /** Ciqual constituent codes, in the order of {@link #NUTRIENTS} */
    public static final String[] CONSTITUENTS = {"328", "25000", "31000", "32000", "40000", "40302", "34100", "10004"};
    public static final String[] NUTRIENTS = {"kcal", "protein", "carbs", "sugars", "fat", "satFat", "fiber", "salt"};

    private CiqualParser() {}

    public static Map<String, Alim> alims(Path file) throws IOException, XMLStreamException {
        Map<String, Alim> out = new LinkedHashMap<>();
        records(file, "ALIM", r -> {
            String code = r.get("alim_code");
            String name = r.get("alim_nom_fr");
            if (code != null && !code.isEmpty() && name != null && !name.isEmpty()) {
                out.put(code, new Alim(code, name, blank(r.get("alim_nom_eng")), r.get("alim_grp_code"), r.get("alim_ssgrp_code")));
            }
        });
        return out;
    }

    /** sub-group code → its French name (or the group's when the sub-group has none) */
    public static Map<String, String> groups(Path file) throws IOException, XMLStreamException {
        Map<String, String> out = new HashMap<>();
        records(file, "ALIM_GRP", r -> {
            String sub = r.get("alim_ssgrp_code");
            String subName = blank(r.get("alim_ssgrp_nom_fr"));
            String grp = r.get("alim_grp_code");
            String grpName = blank(r.get("alim_grp_nom_fr"));
            if (grp != null && grpName != null) {
                out.putIfAbsent(grp, grpName);
            }
            if (sub != null) {
                out.putIfAbsent(sub, subName != null ? subName : grpName);
            }
        });
        return out;
    }

    /**
     * food code → the 8 values of {@link #CONSTITUENTS}, then (1.14) the vitamins and minerals of {@link Micros#ALL} in
     * their order (NaN when unknown)
     */
    public static Map<String, double[]> compo(Path file) throws IOException, XMLStreamException {
        Map<String, Integer> index = new HashMap<>();
        for (int i = 0; i < CONSTITUENTS.length; i++) {
            index.put(CONSTITUENTS[i], i);
        }
        for (int i = 0; i < Micros.ALL.size(); i++) {
            index.put(Micros.ALL.get(i).ciqual(), CONSTITUENTS.length + i);
        }
        final int width = CONSTITUENTS.length + Micros.ALL.size();
        Map<String, double[]> out = new HashMap<>();
        records(file, "COMPO", r -> {
            Integer i = index.get(r.get("const_code"));
            String code = r.get("alim_code");
            if (i == null || code == null) {
                return;
            }
            double[] v = out.computeIfAbsent(code, k -> {
                double[] a = new double[width];
                Arrays.fill(a, Double.NaN);
                return a;
            });
            v[i] = value(r.get("teneur"));
        });
        return out;
    }

    /** 1.14: the vitamins and minerals of a food's values (what compo gives after the 8 nutrients), as their keys */
    public static Map<String, Double> micros(double[] v) {
        Map<String, Double> out = new LinkedHashMap<>();
        for (int i = 0; i < Micros.ALL.size(); i++) {
            int at = CONSTITUENTS.length + i;
            if (at < v.length && !Double.isNaN(v[at]) && v[at] >= 0) {
                out.put(Micros.ALL.get(i).key(), v[at]);
            }
        }
        return out;
    }

    /** "12,5" → 12.5; "traces" and "&lt; 0,5" → 0; "-" or empty → unknown */
    static double value(String s) {
        if (s == null) {
            return Double.NaN;
        }
        String t = s.trim();
        if (t.isEmpty() || t.equals("-")) {
            return Double.NaN;
        }
        if (t.equalsIgnoreCase("traces") || t.startsWith("<")) {
            return 0;
        }
        try {
            return Double.parseDouble(t.replace(',', '.'));
        } catch (NumberFormatException e) {
            return Double.NaN;
        }
    }

    static void records(Path file, String record, Consumer<Map<String, String>> sink) throws IOException, XMLStreamException {
        XMLInputFactory factory = XMLInputFactory.newFactory();
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        try (InputStream in = new BufferedInputStream(Files.newInputStream(file), 1 << 16)) {
            XMLStreamReader r = factory.createXMLStreamReader(in);
            try {
                Map<String, String> current = null;
                String field = null;
                StringBuilder text = new StringBuilder();
                while (r.hasNext()) {
                    int event = r.next();
                    if (event == XMLStreamConstants.START_ELEMENT) {
                        String name = r.getLocalName();
                        if (name.equals(record)) {
                            current = new HashMap<>();
                        } else if (current != null) {
                            field = name;
                            text.setLength(0);
                        }
                    } else if ((event == XMLStreamConstants.CHARACTERS || event == XMLStreamConstants.CDATA) && field != null) {
                        text.append(r.getText());
                    } else if (event == XMLStreamConstants.END_ELEMENT) {
                        String name = r.getLocalName();
                        if (name.equals(record) && current != null) {
                            sink.accept(current);
                            current = null;
                        } else if (current != null && name.equals(field)) {
                            current.put(field, text.toString().trim());
                            field = null;
                        }
                    }
                }
            } finally {
                r.close();
            }
        }
    }

    private static String blank(String s) {
        return s == null || s.isBlank() || s.trim().equals("-") ? null : s.trim();
    }
}
