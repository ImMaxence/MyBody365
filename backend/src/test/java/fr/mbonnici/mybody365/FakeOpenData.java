package fr.mbonnici.mybody365;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

/**
 * Open Food Facts and the research data repository (Ciqual), faked by a local HTTP server: the tests
 * never leave the machine. {@link #ciqualVersion} switches the table published, to test an update.
 */
public final class FakeOpenData {

    public static volatile String ciqualVersion = "2025_11_03";
    private static HttpServer server;

    private FakeOpenData() {}

    public static synchronized String start() {
        if (server == null) {
            try {
                server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
            server.createContext("/", FakeOpenData::handle);
            server.start();
        }
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    private static void handle(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        String query = ex.getRequestURI().getRawQuery() == null ? "" : ex.getRequestURI().getRawQuery();
        if (path.equals("/api/v2/product/3017620422003")) {
            send(ex, 200, "application/json", """
                    {"status":1,"product":{"code":"3017620422003","product_name_fr":"Pâte à tartiner noisettes","brands":"Marque Test",
                     "nutriscore_grade":"e","serving_quantity":15,"last_modified_t":1731400000,
                     "image_front_url":"https://images.openfoodfacts.org/images/products/301/762/042/2003/front_fr.633.400.jpg",
                     "nutriments":{"energy-kcal_100g":539,"proteins_100g":6.3,"carbohydrates_100g":57.5,"sugars_100g":56.3,
                      "fat_100g":30.9,"saturated-fat_100g":10.6,"fiber_100g":0,"salt_100g":0.107}}}""");
        } else if (path.startsWith("/api/v2/product/")) {
            send(ex, 404, "application/json", "{\"status\":0}");
        } else if (path.equals("/search")) {
            send(ex, 200, "application/json", query.contains("skyr") ? """
                    {"hits":[
                      {"code":"5690845000621","product_name_fr":"Skyr nature","brands":["Isey"],"nutriscore_grade":"a",
                       "nutriments":{"energy-kcal_100g":63,"proteins_100g":11,"carbohydrates_100g":4,"sugars_100g":4,"fat_100g":0.2,
                        "saturated-fat_100g":0.1,"salt_100g":0.1}},
                      {"code":"3033490004743","product_name":"Skyr vanille","brands":["Danone"],
                       "nutriments":{"energy-kcal_100g":80,"proteins_100g":9,"carbohydrates_100g":9,"sugars_100g":8.5,"fat_100g":0.2,
                        "saturated-fat_100g":0.1,"salt_100g":0.1}},
                      {"code":"123","product_name":"No energy","nutriments":{}}
                    ]}""" : "{\"hits\":[]}");
        } else if (path.equals("/off/export.csv.gz")) {
            byte[] gz = offExport();
            ex.getResponseHeaders().add("Content-Type", "application/gzip");
            ex.sendResponseHeaders(200, gz.length);
            try (OutputStream out = ex.getResponseBody()) {
                out.write(gz);
            }
        } else if (path.equals("/ciqual/dataset")) {
            String v = ciqualVersion;
            send(ex, 200, "application/json", """
                    {"status":"OK","data":{"latestVersion":{"files":[
                      {"dataFile":{"id":11,"filename":"alim_%s.xml","filesize":900}},
                      {"dataFile":{"id":12,"filename":"compo_%s.xml","filesize":2000}},
                      {"dataFile":{"id":13,"filename":"alim_grp_%s.xml","filesize":400}},
                      {"dataFile":{"id":14,"filename":"Table Ciqual doc.pdf","filesize":10}}
                    ]}}}""".formatted(v, v, v));
        } else if (path.equals("/api/access/datafile/11")) {
            send(ex, 200, "text/xml", """
                    ﻿<?xml version="1.0" encoding="utf-8" ?>
                    <TABLE>
                       <ALIM><alim_code> 13039 </alim_code><alim_nom_fr> Pomme, crue </alim_nom_fr><alim_nom_eng> Apple, raw </alim_nom_eng>
                         <alim_grp_code> 02 </alim_grp_code><alim_ssgrp_code> 0204 </alim_ssgrp_code></ALIM>
                       <ALIM><alim_code> 9100 </alim_code><alim_nom_fr> Riz blanc, cuit </alim_nom_fr><alim_nom_eng missing=" " />
                         <alim_grp_code> 03 </alim_grp_code><alim_ssgrp_code> 0303 </alim_ssgrp_code></ALIM>
                       <ALIM><alim_code> 18066 </alim_code><alim_nom_fr> Eau minérale </alim_nom_fr><alim_nom_eng> Water </alim_nom_eng>
                         <alim_grp_code> 06 </alim_grp_code><alim_ssgrp_code> 0601 </alim_ssgrp_code></ALIM>
                       <ALIM><alim_code> 1 </alim_code><alim_nom_fr> Sans énergie </alim_nom_fr>
                         <alim_grp_code> 02 </alim_grp_code><alim_ssgrp_code> 0204 </alim_ssgrp_code></ALIM>
                    </TABLE>""");
        } else if (path.equals("/api/access/datafile/12")) {
            StringBuilder b = new StringBuilder("<?xml version=\"1.0\" encoding=\"utf-8\" ?>\n<TABLE>\n");
            compo(b, "13039", "328", "52,1");
            compo(b, "13039", "25000", "0,25");
            compo(b, "13039", "31000", "11,6");
            compo(b, "13039", "32000", "9,35");
            compo(b, "13039", "40000", "traces");
            compo(b, "13039", "40302", "&lt; 0,01");
            compo(b, "13039", "34100", "1,4");
            compo(b, "13039", "10004", "0");
            compo(b, "9100", "328", "143");
            compo(b, "9100", "25000", "2,7");
            compo(b, "9100", "31000", "31,1");
            compo(b, "9100", "32000", "-");
            compo(b, "18066", "328", "0");
            compo(b, "1", "328", "-");
            send(ex, 200, "text/xml", b.append("</TABLE>").toString());
        } else if (path.equals("/api/access/datafile/13")) {
            send(ex, 200, "text/xml", """
                    <?xml version="1.0" encoding="utf-8" ?>
                    <TABLE>
                      <ALIM_GRP><alim_grp_code> 02 </alim_grp_code><alim_grp_nom_fr> fruits, légumes </alim_grp_nom_fr>
                        <alim_ssgrp_code> 0204 </alim_ssgrp_code><alim_ssgrp_nom_fr> fruits </alim_ssgrp_nom_fr></ALIM_GRP>
                      <ALIM_GRP><alim_grp_code> 03 </alim_grp_code><alim_grp_nom_fr> produits céréaliers </alim_grp_nom_fr>
                        <alim_ssgrp_code> 0303 </alim_ssgrp_code><alim_ssgrp_nom_fr> - </alim_ssgrp_nom_fr></ALIM_GRP>
                    </TABLE>""");
        } else {
            send(ex, 404, "text/plain", "not found");
        }
    }

    private static void compo(StringBuilder b, String alim, String constituent, String value) {
        b.append("<COMPO><alim_code> ").append(alim).append(" </alim_code><const_code> ").append(constituent)
                .append(" </const_code><teneur> ").append(value).append(" </teneur><min missing=\" \" /></COMPO>\n");
    }


    /**
     * A tiny Open Food Facts export (tab-separated, gzipped, columns in any order): two products sold in
     * France, one sold elsewhere, one without energy, one with a typo (1e6 g of sugar), one twice.
     */
    static byte[] offExport() throws IOException {
        String header = String.join("\t", "code", "url", "product_name", "generic_name", "brands", "countries_tags", "nutriscore_grade",
                "serving_quantity", "energy_100g", "energy-kcal_100g", "fat_100g", "saturated-fat_100g", "carbohydrates_100g", "sugars_100g",
                "fiber_100g", "proteins_100g", "salt_100g",
                // 1.13: size, food group, processing, additives, scans
                "quantity", "pnns_groups_2", "nova_group", "additives_n", "additives_tags", "unique_scans_n");
        String none = "\t\t\t\t\t";
        String[] lines = {
            row("3560070000001", "Kebab poulet sauce blanche", "", "Snack Maison,Autre", "en:france,en:belgium", "c", "250", "", "185", "8", "2.5",
                    "15", "2", "1.2", "12", "1.4") + "\t500 g\tOne-dish meals\t4\t3\ten:e250,en:e955\t42",
            row("3560070000002", "", "Pain à kebab", "Boulangerie", "en:france", "", "", "1100", "", "1.5", "0.3", "52", "3", "2.4", "9", "1.1")
                    + "\t" + none,
            row("4000000000003", "Bratwurst", "", "Wurst", "en:germany", "d", "", "", "290", "25", "9", "1", "0.5", "", "14", "2") + "\t" + none,
            row("3560070000004", "Sans énergie", "", "", "en:france", "", "", "", "", "", "", "", "", "", "", "") + "\t" + none,
            row("3560070000005", "Erreur de saisie", "", "", "en:france", "", "", "", "120", "1", "1", "20", "1000000", "1", "3", "0.1")
                    + "\t33 cl\tunknown\t\t\t\t",
            row("3560070000001", "Kebab poulet sauce blanche", "", "Snack Maison", "en:france", "c", "250", "", "185", "8", "2.5", "15", "2",
                    "1.2", "12", "1.4") + "\t500 g\tOne-dish meals\t4\t3\ten:e250,en:e955\t42",
        };
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        try (java.util.zip.GZIPOutputStream gz = new java.util.zip.GZIPOutputStream(bytes)) {
            gz.write((header + "\n" + String.join("\n", lines) + "\n").getBytes(StandardCharsets.UTF_8));
        }
        return bytes.toByteArray();
    }

    private static String row(String code, String name, String generic, String brands, String countries, String grade, String serving,
            String kj, String kcal, String fat, String satFat, String carbs, String sugars, String fiber, String proteins, String salt) {
        return String.join("\t", code, "https://world.openfoodfacts.org/product/" + code, name, generic, brands, countries, grade, serving, kj,
                kcal, fat, satFat, carbs, sugars, fiber, proteins, salt);
    }

    private static void send(HttpExchange ex, int status, String type, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", type + "; charset=utf-8");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }
}
