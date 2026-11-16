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
             "recipeIngredient":["450 g Pain ((soit 1,5 pain coupé en tranches))","160 g Creme frâiche","120 g Lardons"],
             "recipeInstructions":[{"@type":"HowToSection","name":"Préparation","itemListElement":[
               {"@type":"HowToStep","text":"Couper le pain en tranches."},{"@type":"HowToStep","text":"Faire griller &amp; garnir."}]}],
             "nutrition":{"@type":"NutritionInformation","calories":"212 kcal","proteinContent":"7 g"}}]}</script>
            </head><body>…</body></html>""";

    static final String NO_RECIPE = "<html><head><title>Un blog</title></head><body>Pas de recette ici</body></html>";

    private final Map<String, String> pages = Map.of(
            "https://recettes.example/bruschetta", BRUSCHETTA,
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
}
