# Audit de sécurité — MyBody365 (1.0.0, revu en 1.7.1, en 1.9.0 et en 1.12.0)

Date : 16 novembre 2026. Périmètre : le dépôt complet (back Spring Boot, front Angular, nginx, fichiers Docker Compose), dans sa version 1.0.0 : photos, repas, notifications, amis, sauvegardes, import de recettes, noms d'utilisateur et photos de profil compris.

Méthode : relecture du code de chaque point d'entrée, vérification des règles d'accès ressource par ressource, tests d'intégration ciblés (`backend/src/test`, 75 tests) et de bout en bout (`frontend/e2e`), `npm audit` sur les dépendances livrées.

## Résumé

| Gravité | Constat | État |
|---|---|---|
| Moyenne | Compte « MyBody365 » (1.7.0) : administrateur sans moyen de connexion, mais une demande d'accès ou de récupération à son adresse, validée par erreur, aurait donné un lien vers ce compte administrateur | **Corrigé (1.7.1)** : simple membre, et aucun lien d'invitation ni de récupération ne peut être créé pour lui (refus central dans AccountLinkService) ; ses recettes restent dans la communauté par une exception explicite |
| Faible | Restauration d'une sauvegarde (1.7.0) : un membre pouvait remettre une recette marquée « Communauté » (visible de ses amis, pas de la communauté, jusqu'au redémarrage suivant) | **Corrigé (1.7.1)** : pour un membre, une recette publique d'une sauvegarde revient en « Amis » |
| Faible | Alertes du minuteur (1.7.0) : envoyées sur l'unique fil du planificateur, partagé avec les rappels, sans contrôle d'ordre ni de rythme | **Corrigé (1.7.1)** : le planificateur ne fait que donner le signal, l'envoi part sur l'exécuteur de l'app ; alertes dans l'ordre, espacées d'une seconde au moins, pas plus d'une minute dans le passé, 12 notifications par minute et par compte au plus |
| Faible | Ingrédients non reconnus (1.7.0) : la table pouvait grossir sans fin avec des imports de pages fantaisistes | **Corrigé (1.7.1)** : 5 000 lignes au plus (les lignes connues continuent de compter) |
| Moyenne | Restauration : la taille réellement décompressée d'une sauvegarde n'était pas plafonnée au total (bombe zip) | **Corrigé** : plafond cumulé de 4 Go, en plus des 40 Mo par fichier |
| Moyenne | Les abonnements aux notifications auraient permis de faire appeler n'importe quelle URL par le serveur (SSRF) | **Corrigé avant livraison** : seuls les services de push de Google, Mozilla, Apple et Microsoft sont acceptés, en HTTPS (test dédié) |
| Moyenne | Import de recettes : le serveur va chercher une adresse saisie par un membre (SSRF) | **Traité à la conception** : http(s) sur les ports 80 et 443 seulement, sans identifiants dans l'URL ; le nom doit pointer uniquement vers des adresses publiques (boucle locale, réseaux privés, lien local, CGNAT, multicast, IPv6 locales et IPv4 déguisées refusés), contrôle refait à chaque redirection (4 au plus) ; 3 Mo lus au plus, 10 s, rien sur le membre n'est transmis ; seules les données « Recipe » de la page sont gardées (tests dédiés) |
| Faible | Photo Google : le serveur téléchargeait la photo de profil donnée par Google pour la garder lui-même | **Supprimé en 1.6** : plus aucune photo n'est demandée à Google, celles déjà copiées sont retirées de la base et effacées du stockage (`AvatarCleanup`) ; sans photo choisie, l'initiale s'affiche |
| Faible | Import de recettes : entre la vérification de l'adresse et la connexion, le nom pourrait être redirigé vers une adresse privée (DNS rebinding) | Accepté : la réponse n'est lue que comme une recette (rien d'autre n'est renvoyé), le stockage exige des requêtes signées et la base ne parle pas HTTP |
| Faible | Import de recettes (1.6) : la photo de la recette est téléchargée par le serveur et renvoyée au membre | **Traité à la conception** : uniquement pour le site du créateur de l'app (les-creations-de-yona.fr, liste fixe dans le code), en HTTPS, avec les mêmes contrôles qu'une page (adresses publiques, ports 80 et 443, redirections revérifiées, 10 s) ; 6 Mo au plus, types JPEG, PNG, WebP et AVIF seulement ; l'image est redessinée dans l'app puis réencodée par le serveur comme toute photo de recette (test dédié) |
| Info | Compte « MyBody365 » qui publie les 200 recettes de départ (1.7) | Simple membre (depuis 1.7.1) sans aucun moyen de connexion : adresse du domaine réservé .invalid (aucun compte Google ne peut la porter), ni Google ni passkey, aucun lien d'invitation ou de récupération possible, invisible dans les recherches d'amis. Chaque recette n'est ajoutée qu'une fois (table community_seed), même supprimée ensuite par un admin |
| Info | Paliers et style de la série (1.8) | Chacun ne lit, ne modifie et ne supprime que ses propres paliers (compte de la session, 10 au plus, poids bornés par la base) ; l'icône et la couleur de la série ne sont acceptées que dans la liste de l'app (expressions fermées côté serveur) |
| Info | Alertes du minuteur (1.7) : quand l'app quitte l'écran, les prochains changements de phase partent au serveur | Seulement l'heure, la phase et le numéro de série, liés au compte de la session ; 64 alertes et 4 heures au plus, en mémoire seulement (perdues au redémarrage du serveur), remplacées à chaque envoi et annulées au retour à l'écran ; la notification ne contient aucune donnée de santé |
| Info | Recherche dans la communauté (1.7) | Mots normalisés (5 au plus) passés en paramètres, jokers % et _ échappés ; aucune valeur insérée dans le SQL |
| Moyen | Recettes de la communauté (avant 1.7) : tout membre pouvait montrer à tous une photo ou un texte choquant ou illicite | **Corrigé (1.7)** : seuls les administrateurs publient dans la communauté (refus côté serveur, choix absent de l'app pour un membre) ; au démarrage, une recette publique d'un membre repasse en « Amis », sans rien supprimer. Le signalement et le masquage par les admins restent en place |
| Faible | Notification d'une nouvelle recette à ses amis (1.6) : un membre pourrait en envoyer en rafale | **Traité à la conception** : une seule fois par recette (colonne `announced_at`), une par heure au plus et par auteur, jamais à un ami qui a coupé les notifications des amis ; le lien ouvert est toujours une adresse de l'app (`/app/meals/recipes/…`) ; seul le prénom et le nom de la recette sont dans la notification (test dédié) |
| Faible | Les noms d'utilisateur peuvent être découverts (recherche exacte, suggestions en tapant) | Voulu pour ajouter un ami ; suggestions à partir de 3 caractères, 6 au plus, sans photo, le caractère _ échappé dans la recherche, débit limité à 60 / min, et un réglage pour ne pas apparaître dans les suggestions (la recherche exacte trouve toujours) |
| Faible | La clé privée VAPID (signature des notifications) est stockée en clair en base | Accepté : elle ne permet que d'envoyer des notifications aux appareils abonnés ; à chiffrer si la base est un jour partagée |
| Faible | Un lien d'ami reste utilisable 7 jours par toute personne qui le possède | Voulu (un même QR code pour plusieurs amis) ; générer un nouveau lien invalide l'ancien |
| Faible | Le texte d'un rappel (« tes 12 jours de flamme ») peut s'afficher sur l'écran verrouillé | Accepté : aucune donnée de santé (ni poids, ni repas) dans les notifications |
| Info | Statistiques (1.7) : les aliments qui apportent le plus de sucre, de sel ou de graisses saturées viennent d'une requête dont la colonne est insérée dans le SQL | Sûr : la colonne est choisie dans une liste fixe du code (sugars_g, salt_g, sat_fat_g), toute autre valeur est refusée ; les valeurs du membre restent des paramètres |
| Info | Répartition des macros et séances notées (1.7) | Chacun ne lit et n'écrit que son propre profil et ses propres séances (compte de la session), valeurs bornées par la base (contraintes sur le métier, 0 à 14 séances, trois répartitions) |
| Faible | Saisies sans réseau (1.7) : un repas, une pesée ou des verres d'eau notés hors connexion restent dans le stockage local du téléphone jusqu'à leur envoi | Accepté : rien d'autre que ce que le membre vient de saisir, lié à son compte (jamais envoyé pour un autre), effacé à la déconnexion ; une saisie refusée à l'envoi est abandonnée et signalée |
| Info | Bilan du dimanche (1.7) | La notification ne contient aucun chiffre (ni poids, ni repas) : elle ouvre une page de l'app, derrière la session |
| Info | Ingrédients non reconnus (1.7) | La table ne garde que la ligne de la recette publique et un compteur, sans identifiant de membre ; lue et vidée par les administrateurs seulement |
| Info | Dépense réelle (1.7) | Calculée à partir des seules données du membre, sur demande ; bornée à ±20 % de la formule et au plancher calorique (une sous-déclaration des repas ne fait pas descendre l'objectif sous le minimum de sécurité) |
| Info | La limitation de débit est en mémoire, par instance | Adapté au déploiement actuel (une instance) |
| Info | Le trafic entre le back et SeaweedFS n'est pas chiffré | Réseau Docker interne, le service de stockage n'est jamais publié |

Aucune vulnérabilité connue dans les dépendances livrées du front (`npm audit --omit=dev` : 0). Côté back, toutes les bibliothèques ajoutées sont dans leur dernière version publiée (AWS SDK 2.46.7, TwelveMonkeys 3.12.0).

## Revue des 1.10, 1.11 et 1.12 (19 novembre 2026)

Périmètre : tout ce qui a changé côté serveur depuis la 1.9.2 (27 fichiers) : recettes qui se ressemblent, liste de courses, « Que faire avec ce que j'ai ? », aliments qui existent déjà, photos des recettes de la communauté, rappel de la photo du jour, migrations V25 et V26 ; en 1.12, la photo et la date des produits Open Food Facts, les vignettes des repas, les points rouges des onglets. Côté front : la page Notifications bloquées, la fiche d'un aliment, la note du jour.

Vérifié sans constat :
- `POST /api/me/recipes/lookalikes` et `GET /api/recipes/with` ne comparent que les recettes que le compte voit (les siennes, la communauté non masquée, celles de ses amis qui ne sont pas privées) ; rien n'est enregistré ; 120 caractères et 60 ingrédients au plus, 6 ingrédients choisis au plus
- Liste de courses (`/api/me/shopping*`) : chaque requête porte sur le compte de la session (`user_id` dans chaque `where`, 404 sinon) ; une recette n'est ajoutée que si le compte la voit, l'aliment d'un autre membre n'est repris que par son nom ; 300 caractères par ligne, un nombre de lignes plafonné ; pas dans les sauvegardes
- `POST /api/me/foods/lookalikes` : texte normalisé passé en paramètre à la recherche par trigrammes, les aliments d'un autre membre exclus
- Photos de la communauté : la liste des photos est un fichier du dépôt (aucune adresse venue d'un membre), téléchargées une seule fois par le serveur depuis Wikimedia uniquement, avec les contrôles d'adresse de l'import de recettes ; l'auteur et la licence sont du texte affiché comme tel (pas de HTML)
- 1.12, photo d'un produit (`GET /api/foods/{id}/image`) : le chemin vient des données d'Open Food Facts, que n'importe qui peut modifier là-bas, donc il est vérifié comme une entrée hostile : uniquement un chemin du serveur d'images d'Open Food Facts (adresse fixe dans le code, chiffres, nom de fichier en caractères simples, `.jpg`, `.png` ou `.webp`, pas de `..`), 8 s et 1 Mo au plus, et seule une image JPEG, PNG ou WebP reconnue à ses premiers octets est renvoyée (un SVG ou une page HTML sont refusés, test dédié). Le téléphone ne contacte jamais Open Food Facts : son adresse IP ne leur est pas transmise. Le cache en mémoire est partagé (ce sont des images publiques) et plafonné à 16 Mo. Réservé aux membres connectés comme le reste de l'API ; l'aliment personnel d'un autre membre répond 404 comme un aliment inconnu
- 1.12, vignettes des repas : les photos de recettes passent par le point d'accès existant, qui revérifie que le compte voit la recette (une recette redevenue privée affiche l'emoji)
- 1.12, `GET /api/me/todo` : des nombres sur les seules données du compte (demandes d'ami reçues, invitations à un défi en cours, lignes de courses non cochées, photo du jour)
- 1.12, rappel de la photo du jour activé pour tous : un rappel de plus par jour au plus, seulement si la photo manque et sur un appareil abonné ; l'interrupteur reste dans Notifications
- Notifications bloquées : l'app ne contourne rien, elle explique le chemin vers les réglages du téléphone et ne redemande l'abonnement qu'une fois l'autorisation rendue par la personne

Dépendances : aucune dépendance Maven ni npm livrée ajoutée depuis la 1.9 ; `npm audit --omit=dev` : 0 vulnérabilité. Une alerte concerne `sharp`, outil de développement qui génère les icônes à partir des images du dépôt (jamais livré, jamais appliqué à un fichier extérieur) : à mettre à jour à la prochaine régénération des icônes.

## Revue de la 1.9 (18 novembre 2026)

Périmètre : les points d'API ajoutés en 1.9 (visibilité d'une recette, favoris, partages aux amis et leurs « Bravo », sources des aliments, recherche Ciqual seule), la migration V23, le front des partages (aperçu, image) et les vibrations.

Vérifié sans constat :
- `PUT /api/me/recipes/{id}/visibility` : propriétaire seulement (404 sinon), valeur d'une énumération (400 sinon), « Communauté » refusée à un membre comme à la création et à la modification
- Favoris : un aliment n'est ajouté que s'il est utilisable par le compte (Ciqual, Open Food Facts, ou le sien), une recette que s'il la voit ; la liste retire d'elle-même ce qu'il ne voit plus (recette remise en privé, ami retiré). 200 favoris au plus par compte, effacés avec le compte (clé étrangère en cascade)
- Partages aux amis : le serveur fabrique lui-même l'instantané à partir des données du compte (aucun texte venu de l'app n'est publié tel quel, en dehors des noms de repas déjà saisis par le membre), lisible par ses amis seulement, effacé après 30 jours (tâche de rétention) ou à la suppression du compte. Les kilos n'y sont que si le membre le demande ; la notification ne contient ni chiffre ni nom de repas
- « Bravo » : réservé aux amis de l'auteur (404 pour les autres et pour l'auteur), une fois par personne, l'auteur prévenu une seule fois par ami et seulement s'il accepte les notifications des amis
- `GET /api/foods/sources` : des comptes et des dates, aucune donnée personnelle
- Défis : créés avec des amis seulement (403 sinon), cinq en cours au plus par compte, lus et quittés par leurs membres seulement (404 pour les autres) ; le classement ne montre que des jours réussis ou non (jamais un poids, une quantité d'eau ou un repas). La notification d'invitation ne contient aucun chiffre personnel. Effacés 60 jours après leur fin ou avec le compte
- Palier partagé : le serveur vérifie qu'il appartient au compte et qu'il est atteint ; la récompense n'est jamais copiée dans l'instantané
- Pesée du soir : même règles que la pesée du jour (le compte de la session, 30 à 350 kg, sept jours en arrière au plus), sauvegardée avec les autres pesées
- L'image partagée est dessinée sur le téléphone (canvas), rien n'est envoyé à un service tiers ; le partage passe par la feuille de partage du téléphone
- Vibrations : l'interrupteur posé sur les boutons est caché aux lecteurs d'écran (`aria-hidden`, hors tabulation) et ne fait que transmettre le tap au bouton
- Le logo de l'Anses (Ciqual) n'est pas repris : c'est un modèle déposé ; la page « Aliments bruts » cite la source en texte

## Revue de la 1.7 (17 novembre 2026)

Périmètre : le commit 1.7.0 (127 fichiers), relu point d'entrée par point d'entrée : communauté réservée aux admins et son nettoyage au démarrage, 200 recettes de départ et leur compte, recherche dans la communauté, Nutri-Score des recettes (migration Java V20), import par lien (premier lien d'un message), minuteur et ses alertes écran verrouillé, saisies hors ligne, bilan du dimanche, dépense réelle, tendances de la semaine (colonnes de statistiques), liste admin des ingrédients non reconnus, sauvegardes (nouvelles colonnes).

Vérifié sans constat :
- Toutes les requêtes nouvelles passent leurs valeurs en paramètres ; les seuls morceaux insérés dans le SQL sont des noms d'énumération (type de repas) ou des colonnes choisies dans une liste fixe (sucre, sel, graisses saturées)
- Recherche de la communauté : mots normalisés, 5 au plus, jokers % et _ échappés
- Chaque nouveau point d'API sous /api/me ne lit et n'écrit que les données du compte de la session ; /api/admin/foods/misses est réservé aux admins par la configuration de sécurité
- La communauté ne s'atteint que par la création ou la modification d'une recette (refus serveur pour un membre) ; la copie d'une recette la rend privée ; la restauration est corrigée ci-dessus
- Les recettes de départ viennent de fichiers du dépôt (aucune donnée extérieure à l'exécution), vérifiés par un test
- Le logo d'Open Food Facts est un SVG relu (ni script ni ressource externe), servi par le site et affiché en image
- Front : la course du minuteur et les saisies hors ligne restent dans le stockage local du téléphone (aucune donnée de santé dans le minuteur), effacés à la déconnexion
- Dépendances : `npm audit --omit=dev` : 0 vulnérabilité ; aucune dépendance Maven ajoutée en 1.7

## Authentification et sessions

- Connexion Google (OIDC) ou passkey uniquement, pas de mot de passe. Sessions en base (Spring Session JDBC), cookie `MBSESSION` HttpOnly, SameSite=Lax, Secure en production, 90 jours.
- Chaque requête revérifie le compte (`UserStateFilter`) : une suspension coupe l'accès immédiatement.
- CSRF : jeton dans le cookie `XSRF-TOKEN`, renvoyé en en-tête par Angular, exigé sur toute écriture.
- Liaison Google Drive : paramètre `state` aléatoire lié à la session, vérifié au retour ; la permission demandée est `drive.file` (l'app ne voit que les fichiers qu'elle crée). Le jeton de rafraîchissement est chiffré (AES-256-GCM, clé dérivée par HKDF du secret client OAuth, absent de la base).

## Contrôle d'accès, ressource par ressource

| Ressource | Règle | Vérifié par |
|---|---|---|
| Photos | Propriétaire ; ami avec qui elle est partagée (tant que l'amitié dure) ; administrateur seulement si un signalement est ouvert. Réponse 404 sinon, pour ne rien révéler | `PhotoTest`, `FriendsTest` |
| Repas, aliments perso, séances, sauvegardes | Propriétaire uniquement (toutes les requêtes filtrent par compte) | `MealsTest`, `EngagementTest`, `BackupTest` |
| Recettes | Propriétaire ; ses amis si elle leur est montrée ; tout membre si partagée avec la communauté ; jamais masquée ; administrateur | `MealsTest`, `FriendsTest`, `SocialTest` |
| Photo de profil | Le membre ; ses amis ; les membres à qui il a demandé d'être amis ; administrateur. 404 sinon | `SocialTest` |
| Demandes d'ami | Envoyées et reçues par le compte ; acceptation par le destinataire seulement | `SocialTest` |
| Votes | Impossible sur sa propre recette ou une recette non partagée | `MealsTest` |
| Partage de photo | Ses propres photos, à ses amis uniquement | `FriendsTest` |
| Signalements | Seulement ce que le membre voit (recette partagée, photo partagée avec lui) | `FriendsTest` |
| Aperçu de restauration | Jeton lié au compte, valable une heure, à usage unique | `BackupTest` |
| Administration (`/api/admin/**`) | Rôle administrateur | `SecurityTest`, `MealsTest`, `FriendsTest` |

## Entrées et fichiers

- **Images** (photos, recettes, photo de profil) : type vérifié par signature (JPEG, PNG, WebP), dimensions lues avant décodage (60 mégapixels au plus contre les bombes de décompression), puis l'image est redessinée et réencodée : aucune métadonnée d'origine ne survit (test avec une position GPS cachée). Servies avec un type fixe, `nosniff`, `Cache-Control: private`. Une photo de profil remplacée ou retirée est effacée du stockage, et son ancienne adresse répond 404.
- **Import de recettes** : voir le résumé ; l'adresse de la source enregistrée sur une recette doit commencer par `https://` ou `http://` (pas de `javascript:`), le lien s'ouvre avec `rel="noopener noreferrer nofollow"`. La photo du site n'est pas copiée.
- **Noms d'utilisateur** : `[a-z0-9._]{3,20}`, unicité garantie par un index et par la base à la création (déclencheur), quelques noms réservés (admin, support…).
- **Sauvegardes** : seuls les noms connus sont lus (expression stricte, aucun chemin ne peut sortir de son dossier, test avec `../../etc/passwd`), 30 000 entrées au plus, 40 Mo par entrée lus avec une limite réelle, 4 Go au total. Les données sont relues colonne par colonne selon une liste blanche typée ; chaque valeur est un paramètre SQL ; tout identifiant de compte présent dans le fichier est ignoré (test). Une valeur refusée par la base annule toute la restauration.
- **XML Ciqual** : lecture en flux (StAX), DTD et entités externes désactivées (pas de XXE).
- **Open Food Facts** : appelé par le serveur seulement, codes-barres limités à 6–14 chiffres, URL fixées par la configuration. La copie locale vient de l'export officiel (URL de configuration), lancée par un admin seulement ; chaque valeur lue est bornée (énergie ≤ 1 000 kcal, nutriments ≤ 100 g pour 100 g), le fichier temporaire est effacé après lecture. Le jeu de données Ciqual vient d'une URL de configuration ; les identifiants de fichiers lus dans sa réponse sont numériques.
- **Google Drive** : identifiants de fichiers validés, URL d'envoi « resumable » vérifiée (googleapis.com) avant usage.
- **Validation** : Bean Validation sur tous les corps de requête (bornes des quantités, des nutriments, des heures, des jours de la semaine, des identifiants de programmes).

## En-têtes et front

- CSP stricte inchangée : `script-src 'self'` et deux empreintes ; `img-src` accepte `blob:` (aperçus locaux) et `data:` (QR code dessiné dans la page) ; aucune requête vers un tiers depuis l'app.
- `Permissions-Policy` : caméra autorisée pour le site lui-même uniquement (photo du jour, codes-barres, QR codes), micro et géolocalisation interdits.
- Aucun `innerHTML` alimenté par une donnée d'utilisateur (noms et notes de recettes passent par l'interpolation d'Angular).
- Les liens à usage sensible (invitations, liens d'ami) sont lus dans le fragment `#…` (jamais envoyé au serveur ni journalisé) puis retirés de la barre d'adresse.

## Limitation de débit

| Politique | Limite par IP |
|---|---|
| API | 600 / min |
| Connexion | 20 / min |
| Demandes d'accès | 5 / h |
| Envois d'images (dont la photo de profil), sauvegardes (export, aperçu, Drive), import de recettes | 120 / h |
| Recherche d'aliments et codes-barres (Open Food Facts), recherche et suggestions de noms d'utilisateur | 60 / min |
| Demandes d'ami en attente | 50 par compte |
| Coups de pouce | 1 / jour et par ami |

## Données personnelles

- Les administrateurs ne voient jamais une photo, sauf signalée, le temps du traitement (test).
- Les amis ne voient que le prénom, le nom d'utilisateur, la photo de profil, la flamme et la journée validée.
- Suppression d'un compte : données en cascade, fichiers du stockage effacés après validation de la suppression (test).
- Durées de conservation appliquées chaque nuit (`RetentionJob`) : demandes d'accès et signalements traités après 12 mois, journal d'administration après un an, coups de pouce après 30 jours, sauvegardes en attente de restauration après une heure.
- Export complet de ses données à tout moment (Profil › Sauvegardes).

## Déploiement

- Images non root (back, nginx). Le stockage SeaweedFS et la base ne sont exposés que sur le réseau interne ; identifiants générés par Coolify.
- nginx : 30 Mo par requête, 600 Mo pour le seul envoi d'une sauvegarde.
- Variables obligatoires vérifiées au démarrage (Google, administrateurs) ; aucune valeur secrète par défaut en production.

## Recommandations pour la suite

1. Chiffrer la clé privée VAPID avec la même méthode que les jetons Drive.
2. Ajouter une analyse automatique des dépendances Maven (OWASP Dependency-Check) le jour où une CI existe.
3. Si plusieurs instances du back tournent un jour : déplacer la limitation de débit et les rappels planifiés vers une coordination partagée (Redis ou verrous en base).
