package fr.mbonnici.mybody365;

import fr.mbonnici.mybody365.common.ApiException;
import fr.mbonnici.mybody365.recipe.PageFetcher;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

/** Recipe sites in the tests: canned pages, no request leaves the machine. */
public class CannedPages implements PageFetcher {

    public final List<URI> fetched = new CopyOnWriteArrayList<>();

    /** a WordPress recipe card: the recipe inside a Yoast @graph, HowToSection steps, entities, doubled brackets */
    static final String BRUSCHETTA = """
            <html><head><title>Bruschetta</title>
            <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"Bruschetta"},
            {"@type":"Recipe","name":"Bruschetta","recipeYield":["14","14 personnes"],"recipeCategory":["Ap&eacute;ro festif &amp; mini tapas"],
             "image":"https://recettes.example/bruschetta.webp",
             "recipeIngredient":["450 g Pain ((soit 1,5 pain coupé en tranches))","160 g Creme frâiche","120 g Lardons"],
             "recipeInstructions":[{"@type":"HowToSection","name":"Préparation","itemListElement":[
               {"@type":"HowToStep","text":"Couper le pain en tranches."},{"@type":"HowToStep","text":"Faire griller &amp; garnir."}]}],
             "nutrition":{"@type":"NutritionInformation","calories":"212 kcal","proteinContent":"7 g"}}]}</script>
            </head><body>…</body></html>""";

    /**
     * A recipe of les-creations-de-yona.fr, as the site writes it (Angular SSR, recipe.resolver.ts): a @graph with the
     * Recipe and its breadcrumb, the photo, "8 portions", two parts with their steps, the nutrition of the whole recipe.
     */
    static final String TARTE = """
            <html lang="fr"><head><title>Tarte Normande</title>
            <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
            {"@type":"Recipe","@id":"https://les-creations-de-yona.fr/recettes/tartes/tarte-normande#recette","name":"Tarte Normande",
             "image":["https://les-creations-de-yona.fr/api/images/4599/1600.webp"],"inLanguage":"fr-FR",
             "author":{"@type":"Person","name":"Yona"},"recipeCategory":"Pour les Grandes Occasions, Tartes & Desserts Faciles",
             "recipeYield":"8 portions","prepTime":"PT30M","cookTime":"PT40M","totalTime":"PT1H10M",
             "recipeIngredient":["200 g Farine","100 g Beurre (Bien froid et coupés en morceaux)","100 g Oeufs (2 oeufs entier)",
               "60 g Sucre","2 g Sel","100 g Creme frâiche","Calvados (facultatif)"],
             "nutrition":{"@type":"NutritionInformation","servingSize":"la recette entière","calories":"2400 calories","fatContent":"120 g",
               "carbohydrateContent":"280 g","proteinContent":"48 g"},
             "recipeInstructions":[
               {"@type":"HowToSection","name":"La pâte","itemListElement":[
                 {"@type":"HowToStep","position":1,"name":"Sablez","text":"Sablez la farine et le beurre."},
                 {"@type":"HowToStep","position":2,"name":"Ajoutez","text":"Ajoutez l'œuf, puis filmez."}]},
               {"@type":"HowToSection","name":"La garniture","itemListElement":[
                 {"@type":"HowToStep","position":1,"name":"Fouettez","text":"Fouettez la crème et le sucre."}]}]},
            {"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil"}]}]}</script>
            </head><body>…</body></html>""";

    static final String NO_RECIPE = "<html><head><title>Un blog</title></head><body>Pas de recette ici</body></html>";

    /** a tiny WebP (its header is enough here: the app redraws it) */
    static final byte[] PHOTO = {'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P'};

    private final Map<String, String> pages = Map.of(
            "https://recettes.example/bruschetta", BRUSCHETTA,
            "https://les-creations-de-yona.fr/recettes/tartes/tarte-normande", TARTE,
            "https://blog.example/", NO_RECIPE);

    @Override
    public String fetch(URI uri) {
        fetched.add(uri);
        String page = pages.get(uri.toString());
        if (page == null) {
            throw ApiException.badRequest("recipe_unreachable");
        }
        return page;
    }

    @Override
    public Photo image(URI uri) {
        fetched.add(uri);
        if (!uri.toString().equals("https://les-creations-de-yona.fr/api/images/4599/1600.webp")) {
            throw ApiException.badRequest("recipe_unreachable");
        }
        return new Photo("image/webp", PHOTO);
    }
}
