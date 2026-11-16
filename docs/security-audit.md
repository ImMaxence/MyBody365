# Audit de sécurité — MyBody365 1.0.0

Date : 16 novembre 2026. Périmètre : le dépôt complet (back Spring Boot, front Angular, nginx, fichiers Docker Compose), dans sa version 1.0.0 : photos, repas, notifications, amis, sauvegardes, import de recettes, noms d'utilisateur et photos de profil compris.

Méthode : relecture du code de chaque point d'entrée, vérification des règles d'accès ressource par ressource, tests d'intégration ciblés (`backend/src/test`, 75 tests) et de bout en bout (`frontend/e2e`), `npm audit` sur les dépendances livrées.

## Résumé

| Gravité | Constat | État |
|---|---|---|
| Moyenne | Restauration : la taille réellement décompressée d'une sauvegarde n'était pas plafonnée au total (bombe zip) | **Corrigé** : plafond cumulé de 4 Go, en plus des 40 Mo par fichier |
| Moyenne | Les abonnements aux notifications auraient permis de faire appeler n'importe quelle URL par le serveur (SSRF) | **Corrigé avant livraison** : seuls les services de push de Google, Mozilla, Apple et Microsoft sont acceptés, en HTTPS (test dédié) |
| Moyenne | Import de recettes : le serveur va chercher une adresse saisie par un membre (SSRF) | **Traité à la conception** : http(s) sur les ports 80 et 443 seulement, sans identifiants dans l'URL ; le nom doit pointer uniquement vers des adresses publiques (boucle locale, réseaux privés, lien local, CGNAT, multicast, IPv6 locales et IPv4 déguisées refusés), contrôle refait à chaque redirection (4 au plus) ; 3 Mo lus au plus, 10 s, rien sur le membre n'est transmis ; seules les données « Recipe » de la page sont gardées (tests dédiés) |
| Faible | Import de recettes : entre la vérification de l'adresse et la connexion, le nom pourrait être redirigé vers une adresse privée (DNS rebinding) | Accepté : la réponse n'est lue que comme une recette (rien d'autre n'est renvoyé), le stockage exige des requêtes signées et la base ne parle pas HTTP |
| Faible | Les noms d'utilisateur peuvent être découverts (recherche exacte, suggestions en tapant) | Voulu pour ajouter un ami ; suggestions à partir de 3 caractères, 6 au plus, sans photo, le caractère _ échappé dans la recherche, débit limité à 60 / min, et un réglage pour ne pas apparaître dans les suggestions (la recherche exacte trouve toujours) |
| Faible | La clé privée VAPID (signature des notifications) est stockée en clair en base | Accepté : elle ne permet que d'envoyer des notifications aux appareils abonnés ; à chiffrer si la base est un jour partagée |
| Faible | Un lien d'ami reste utilisable 7 jours par toute personne qui le possède | Voulu (un même QR code pour plusieurs amis) ; générer un nouveau lien invalide l'ancien |
| Faible | Le texte d'un rappel (« tes 12 jours de flamme ») peut s'afficher sur l'écran verrouillé | Accepté : aucune donnée de santé (ni poids, ni repas) dans les notifications |
| Info | La limitation de débit est en mémoire, par instance | Adapté au déploiement actuel (une instance) |
| Info | Le trafic entre le back et SeaweedFS n'est pas chiffré | Réseau Docker interne, le service de stockage n'est jamais publié |

Aucune vulnérabilité connue dans les dépendances livrées du front (`npm audit --omit=dev` : 0). Côté back, toutes les bibliothèques ajoutées sont dans leur dernière version publiée (AWS SDK 2.46.7, TwelveMonkeys 3.12.0).

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
- **Open Food Facts** : appelé par le serveur seulement, codes-barres limités à 6–14 chiffres, URL fixées par la configuration. Le jeu de données Ciqual vient d'une URL de configuration ; les identifiants de fichiers lus dans sa réponse sont numériques.
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
