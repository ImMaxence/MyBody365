# Changelog

Toutes les évolutions de MyBody365, de la plus récente à la plus ancienne. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et les numéros de version [SemVer](https://semver.org/lang/fr/). Cette page est aussi publiée sur le site, rubrique Nouveautés

## [1.5.0] - 2026-11-17

Le Nutri-Score des repas au snack, une caméra au bon cadrage, des tiroirs qu'on baisse au doigt, et plus de flou sous l'heure

### Ajouté
- Repas au snack : un Nutri-Score estimé pour chaque format, les frites, les extras et chaque boisson (sur le barème des boissons), et celui du repas entier. Il est enregistré avec chaque ligne, il compte donc dans la note d'équilibre et les statistiques

### Modifié
- Les tiroirs se baissent au doigt depuis n'importe où quand leur contenu est tout en haut, comme sur iPhone, et se ferment au-delà d'un certain point ou d'un geste vif. Si tu remontes dans un long tiroir puis continues vers le bas, il suit
- Une bande de la couleur de la page sous l'heure et la batterie : iOS n'y floute plus ce qui défile

### Corrigé
- Caméra (photo du jour et scan) : plus d'effet de zoom, et les photos sont bien enregistrées en portrait. L'aperçu montre exactement le cadre de la photo, au format 3:4

## [1.4.0] - 2026-11-17

Le repas au snack estimé en deux touches, Open Food Facts gardé sur notre serveur, et des écrans qui arrivent en douceur

### Ajouté
- Burger, kebab, pizza, tacos, frites, nuggets, sushi, sandwich, salade : un tiroir d'estimation. Tu choisis le format, les frites, la sauce et la boisson (Coca, Coca zéro, Ice Tea, jus, bière…), le total se calcule au fur et à mesure, et chaque élément s'ajoute au repas sur sa propre ligne
- Open Food Facts en local : depuis l'administration, la mise à jour télécharge l'export complet et garde les produits vendus en France. Les recherches et les scans restent ensuite sur notre serveur, Open Food Facts n'est plus appelé qu'en secours pour un code-barres tout neuf

### Modifié
- Les écrans arrivent en douceur : un fondu avec une légère remontée, d'un seul tenant, au changement d'onglet comme à l'ouverture de l'app
- Repas : le jour choisi s'allume sur place, la pastille ne glisse plus d'un jour à l'autre, et changer de semaine est un simple fondu
- Les interrupteurs ne grossissent plus quand le doigt passe dessus en faisant défiler
- Plus d'espace entre le titre et le texte des tiroirs (ajout rapide, etc.)

### Corrigé
- Notifications : l'heure du rappel n'est plus collée au rappel du jour
- Les longs tiroirs (comme l'IMC) ne remontent plus en laissant un vide en dessous, et remonter dans leur texte ne les ferme plus : on les ferme par la poignée, d'un glissé quand ils sont tout en haut, ou par leur bouton

## [1.3.0] - 2026-11-17

Un retour en arrière à la façon de l'iPhone, des écrans qui arrivent d'un bloc, l'IMC idéal pour ton âge, un repère plus juste que l'IMC pour les sportifs, et l'app qui se met à jour toute seule

### Ajouté
- IMC idéal pour ton âge, ta taille et ton sexe, avec le poids qui va avec et la zone conseillée à ton âge, marqué sur l'échelle de couleurs
- L'IMC ne voit pas les muscles : ton tour de taille rapporté à ta taille (sain sous 0,5, pour tout le monde) et ta masse grasse, quand tu les notes dans ta pesée, complètent la fiche. Si ton IMC est élevé mais ton tour de taille sain, l'app te dit que c'est sûrement du muscle
- Progrès : une tuile Tour de taille, avec sa zone
- Le bouton retour affiche l'écran précédent (« ‹ Profil »), au-dessus du grand titre, comme sur iPhone

### Modifié
- L'app se met à jour toute seule, quand tu la quittes : plus de bouton pour recharger. Elle vérifie s'il y a une nouvelle version chaque fois que tu y reviens
- Pousser et revenir d'un écran prennent le rythme de l'iPhone : un départ vif, une arrivée douce, l'écran de dessous un peu en retrait et assombri
- Statistiques, recettes, photos, amis, comparateur : le contenu ne glisse plus en place à l'arrivée, seule la transition de l'écran bouge
- Aucun effet de survol sur téléphone : les lignes ne grisent plus quand on fait défiler

### Corrigé
- Retour au doigt : l'écran qui suit le doigt gardait parfois ses couleurs et ses mises en page en route (« tout le CSS part »), et un geste relâché pouvait rester bloqué à mi-chemin
- Le cadre orange autour de la poignée des tiroirs (supprimer mon compte, etc.) a disparu

## [1.2.0] - 2026-11-17

Écrire au créateur depuis l'app, des pastilles pour ce qui reste à faire, un retour au doigt comme sur iPhone, et des écrans qui ne clignotent plus

### Ajouté
- « Une idée, un bug ? » dans le Profil : un message au créateur (idée, bug ou autre), lu dans l'administration, et une notification aux admins à chaque message
- Pastilles rouges : sur l'onglet Profil, sur « Connexion et sécurité » tant qu'aucune passkey n'est enregistrée, et sur « Sauvegardes » tant que la sauvegarde sur Google Drive n'est pas activée
- Administration : un onglet Retours et un journal des erreurs, sur les téléphones comme sur le serveur. Chaque erreur est comptée une seule fois, avec son nombre, sa trace et l'appareil, et s'archive une fois traitée
- Le nombre de choses à traiter s'affiche à côté d'« Administration » dans le Profil, et sur chaque onglet de l'administration

### Modifié
- Retour au doigt depuis le bord gauche : l'écran précédent est déjà là, dessous, comme sur iPhone. Le geste de retour du téléphone, qui montrait un écran gris puis rejouait l'animation, laisse la place à celui de l'app
- Repas : changer de jour est un simple fondu, changer de semaine fait glisser la semaine, et les repas ne s'affichent plus l'un après l'autre
- Les écrans s'affichent d'un bloc, seul le fondu entre les onglets reste

### Corrigé
- Progrès et les autres onglets : l'écran ne disparaît plus une fraction de seconde juste après s'être affiché
- Ouvrir un tiroir avec un champ (supprimer mon compte, ajouter un compte…) n'ouvre plus le clavier tout seul, et le tiroir reste au-dessus du clavier quand on touche le champ

## [1.1.0] - 2026-11-17

Les retours des premiers jours sur iPhone : une barre d'onglets plus basse, plus de zoom, la pastille rouge sur l'icône, des réglages de notifications refaits, l'IMC et l'objectif de calories expliqués

### Ajouté
- Pastille rouge sur l'icône de l'app avec le nombre de notifications reçues, effacée dès que tu ouvres l'app
- Une notification à chaque nouvelle version de l'app, désactivable dans les réglages des notifications
- Rappels « Pense à boire » à 10 h, 13 h, 16 h et 19 h, seulement s'il te manque des verres d'eau à cette heure-là
- Les verres d'eau s'activent directement depuis l'écran Aujourd'hui
- Progrès : ta tranche d'IMC sous le chiffre et, en touchant la tuile, une fiche qui l'explique : l'échelle en couleurs, la corpulence normale pour ta taille, le prochain palier et l'IMC à ton objectif
- Repas : une phrase sous l'anneau explique ton objectif de calories (pour perdre combien par semaine, à partir de quelle dépense) et dit qu'il baisse un peu à chaque kilo perdu
- Une icône calendrier dans les champs de date, une horloge sur l'heure du rappel

### Modifié
- Barre d'onglets plus basse et plus fine, au plus près du bas de l'écran, et lisible quel que soit le contenu qui passe dessous
- Plus de zoom à deux doigts ni au double tap dans l'app (le site reste zoomable)
- Changer d'onglet est un simple fondu et le contenu apparaît sans glisser : plus d'effet de rebond quand on navigue vite
- Réglages des notifications refaits : un interrupteur par rappel, enregistré aussitôt, l'heure du rappel juste en dessous
- Aujourd'hui : « Photo du jour » et « Repas » quittent la liste, ils ont leur onglet. Profil : « Amis » et « Minuteur » s'en vont, ils sont sur Aujourd'hui
- Photos : le bandeau « Prendre la photo du jour » passe en texte blanc sur un orange plus profond
- Ta photo Google est copiée dans l'app au lieu d'être chargée chez Google à chaque affichage
- « 1 ami · 1 a validé sa journée » au lieu de « 1 ami(s) · 1 ont validé »

### Corrigé
- La photo de profil Google s'affichait comme un « ? » sur iPhone : c'est maintenant ta photo, ou ton initiale si elle ne se charge pas
- La page Notifications dépassait de l'écran (bouton « Désactiver » coupé, champ d'heure trop large)
- Le champ « Date de naissance » du parcours de bienvenue dépassait du bord sur iPhone
- Les drapeaux FR et EN n'étaient pas centrés dans leur cadre
- Les coins des cases à cocher paraissaient coupés
- Photos : la mention « Tes photos ne sont visibles que par toi » est bien centrée

## [1.0.0] - 2026-11-16

La version 1.0 : tes repas en un coup d'œil avec une note d'équilibre, une prévision mois par mois, des recettes à importer, des amis qu'on trouve par leur nom d'utilisateur, un minuteur et des verres d'eau

### Ajouté
- Note d'équilibre de la journée sur 10, à partir de ce que tu as noté : calories, macros, qualité des aliments (Nutri-Score) et nutriments, avec le détail de chaque critère
- Prévision mois par mois jusqu'à ton objectif, sur l'écran Progrès et dans ton plan, à ton rythme réel ou au rythme prévu
- Chronos enregistrés sous le nom de ton choix (30 caractères au plus), sur tous tes appareils et dans les sauvegardes ; le minuteur démarre en mode Personnalisé
- L'activation des notifications mise en avant sur le Profil et sur Aujourd'hui
- Bouton « Contacter le créateur » en bas de l'administration
- Référencement : données structurées (application et questions fréquentes), plan du site complet avec les versions anglaises, fichier llms.txt pour les assistants IA, image d'aperçu quand le site est partagé
- Repas : la semaine sous le pouce, chaque jour marqué d'une icône (dans l'objectif, au-dessus, en dessous, en cours), et un calendrier du mois en touchant la date
- Statistiques des repas sur 7 jours, 30 jours ou 3 mois : moyenne par jour, bilan de la période en kcal et en kilos, jours dans l'objectif, calories jour par jour (semaine par semaine sur 3 mois), d'où viennent tes calories, ce que tu manges le plus, par repas, Nutri-Score de tes calories, et des conseils tirés de tout ça
- Chaque graphique a son tableau de chiffres, et se lit au doigt, à la souris ou au clavier
- Importer une recette depuis un site de recettes : colle le lien (ou partage la page vers MyBody365 sur Android), le nom, les parts, les ingrédients et les étapes sont remplis, tu indiques les calories par part. Le lien vers le site reste sur la recette
- Recettes avec les calories saisies à la main : ingrédients écrits ligne par ligne, calories et macros par part
- Ajout rapide : un repas au restaurant ou en fast-food avec juste son nom et ses calories (et ses macros si tu les connais), proposé de nouveau dans tes récents
- Raccourcis « Au restaurant, en fast-food » dans la recherche d'aliments : burger, kebab, pizza, tacos, frites, nuggets, sushi, sandwich, salade
- Recettes de tes amis : chaque recette se règle sur Moi, Amis ou Communauté, et un onglet Amis les rassemble
- Nom d'utilisateur unique, créé à la première connexion et modifiable dans ton profil
- Ajouter un ami par son nom d'utilisateur : recherche exacte, demande d'ami, accepter ou refuser, notification à chaque étape. Le lien et le QR code restent là
- Photo de profil à toi, visible par tes amis seulement, à la place de la photo Google
- Progrès : des icônes sur les chiffres clés, l'objectif écrit sur sa ligne
- Le site présente l'app avec de vraies captures, en clair et en sombre, avant d'installer
- Drapeaux sur le choix de la langue
- Minuteur : effort, repos et nombre de tours (ou un préréglage : Tabata, gainage, fractionné…), un « prêt » de 5 secondes, des bips sur les dernières secondes, une vibration à chaque changement, l'écran qui reste allumé
- Verres d'eau, désactivés par défaut : à activer dans ton profil, un objectif calculé selon ton poids et réglable, un verre de 25 cl à cocher sur l'écran Aujourd'hui, compris dans les sauvegardes
- Choisir une date d'arrivée pour son objectif : l'app calcule le rythme, et dit quand la date est trop proche pour rester en bonne santé
- Suggestions en tapant le nom d'utilisateur d'un ami (à partir de 3 lettres), avec un réglage pour ne pas y apparaître
- Nutri-Score bien en avant, comme sur les emballages : les 5 lettres sur une étiquette blanche, celle de l'aliment en grand, avec la mention « estimé » quand l'app le calcule elle-même
- Connexion locale avec un nouveau compte, pour tester le parcours de bienvenue, ou avec un compte de démo rempli : deux mois de pesées, des photos, trois semaines de repas, des amis, un partage et une demande d'ami (développement uniquement)
- Progrès : l'objectif toujours visible sur le graphique

### Modifié
- Stockage : 2 Go par compte au lieu de 1 Go
- Les choix à plusieurs options glissent comme la barre d'onglets, avec la même pastille orange
- Filtres des recettes plus grands au doigt, sans barre de défilement, avec la même animation
- Sélecteur de poids : le nombre est bien centré et bouge à chaque appui sur − ou +
- Boutons principaux en texte blanc sur un dégradé plus profond, lisible partout (contraste AA)
- Administration : changer d'onglet ne rejoue plus l'animation de la page
- Minuteur plus fluide : l'anneau suit chaque image, un halo à chaque changement de phase
- Repas : le changement de jour est un fondu doux, les boutons Statistiques et Recettes sont bien visibles
- Sur ordinateur, les rangées de filtres passent à la ligne au lieu de défiler hors de l'écran
- Le minuteur remplace les programmes de séances et les rappels de salle : l'app reste centrée sur les repas et le poids, le sport en complément, sans ajouter de calories au budget du jour. Les séances déjà enregistrées restent dans les sauvegardes
- Rythme limité à 1 % de ton poids par semaine (1 kg au plus), les rythmes plus rapides sont grisés
- Pages légales : les onglets glissent comme ailleurs, sans animation de page, et les noms longs passent sur deux lignes

### Corrigé
- Les tiroirs se ferment aussi sur ordinateur : clic à côté, clic sur la poignée, Échap, ou glissé vers le bas au doigt
- La prévision du graphique de progrès ne sort plus du cadre, même avec une seule pesée
- Retour depuis les pages légales et les nouveautés : on revient à l'écran d'avant (le profil dans l'app), plus à l'écran Aujourd'hui
- Retour depuis Amis ou le minuteur après une réouverture de l'app : vers le profil
- Aujourd'hui : plus d'espace entre « Ton objectif » et le poids visé
- La carte « Créer un aliment » s'affichait mal (titre et texte collés)
- Le texte d'aide des cases à cocher (verres d'eau, suggestions…) était collé à leur titre
- Photos : « 3 Photo(S) » à côté du mois, une majuscule de trop

### Sécurité
- Import de recettes : le serveur ne va que vers des sites publics (ni réseau interne ni adresse privée, vérifié à chaque redirection), lit 3 Mo au plus en 10 secondes, sans rien transmettre sur toi
- La photo de profil passe par le même traitement que les autres photos : vérifiée, redessinée, recadrée, sans aucune métadonnée ; l'ancienne est effacée
- La recherche par nom d'utilisateur donne une correspondance exacte ; les suggestions démarrent à 3 lettres, s'arrêtent à 6, montrent le prénom sans photo, respectent ceux qui ne veulent pas y figurer, et leur débit est limité

## [0.7.0] - 2026-11-16

Tes données sont à toi : une sauvegarde complète en un tap, chaque nuit sur ton Google Drive si tu veux, et une restauration qui montre d'abord ce qui va changer

### Ajouté
- Sauvegarde à télécharger : un seul fichier avec tout ce que tu as saisi et toutes tes photos et images de recettes
- Restauration d'une sauvegarde avec un aperçu détaillé avant de confirmer : ce qui sera ajouté, modifié ou absent, catégorie par catégorie (pesées, photos, repas, aliments, recettes, séances)
- Deux façons de restaurer : fusionner (la sauvegarde l'emporte sur les jours qu'elle contient) ou tout remplacer
- Google Drive : sauvegarde automatique chaque nuit dans un dossier MyBody365, les 10 dernières gardées, sauvegarde à la demande et restauration depuis ton Drive
- Pages légales et mentions des licences mises à jour pour les photos, les repas, les notifications, les amis et les sauvegardes

### Sécurité
- Google Drive avec la permission la plus restreinte : l'app ne voit que les fichiers qu'elle crée. Le jeton est conservé chiffré
- Une sauvegarde est vérifiée avant tout : format, taille, noms de fichiers ; seul ce que l'app connaît est lu, et chaque donnée va au compte qui restaure
- Une sauvegarde envoyée pour restauration est effacée du serveur dès sa restauration, ou au bout d'une heure
- Les durées de conservation de la politique de confidentialité sont appliquées automatiquement chaque nuit

## [0.6.0] - 2026-11-16

À plusieurs, la flamme tient mieux : tes amis, leurs flammes, des coups de pouce et des photos partagées une par une

### Ajouté
- Amis : invite avec un QR code ou un lien valable 7 jours, ajoute un ami en scannant son QR code ou en collant son lien
- Le lien d'ami fonctionne aussi dans le navigateur : il ajoute l'ami tout de suite si tu es connecté, sinon il explique comment finir dans l'app
- La flamme de chacun de tes amis et s'il a déjà validé sa journée, aussi sur l'écran Aujourd'hui
- Coup de pouce : une notification sur le téléphone de ton ami, une fois par jour au plus, s'il accepte les rappels de ses amis
- Partage d'une photo précise avec les amis de ton choix, et arrêt du partage quand tu veux. Les photos partagées avec toi sont rangées à part
- Signalement d'une recette de la communauté ou d'une photo partagée avec toi
- Administration : onglet Modération avec les signalements à traiter, la recette à masquer ou la photo à supprimer, et la liste des recettes partagées

### Sécurité
- Les administrateurs ne voient une photo que si elle a été signalée, et seulement le temps de traiter le signalement
- Le lien d'ami n'est jamais conservé en clair et disparaît de la barre d'adresse dès son ouverture
- Retirer un ami arrête aussitôt tous les partages de photos entre vous

## [0.5.0] - 2026-11-16

Ta flamme résiste aux jours sans, tes rappels arrivent sur ton téléphone et tes séances sont prêtes

### Ajouté
- Gels de flamme : tous les 7 jours d'affilée, tu gagnes un gel (2 au maximum) qui sauve automatiquement un jour oublié
- Détail de ta flamme : ton record, tes gels en stock et le calendrier de tes 28 derniers jours
- Notifications sur ton téléphone : un rappel du jour à l'heure de ton choix, seulement s'il te manque ta pesée ou ta photo
- Rappel salle les jours que tu choisis, à l'heure que tu choisis
- Notification de test pour vérifier que tout fonctionne sur ton appareil
- Salle et séances : trois programmes prêts à suivre (full body débutant, haut / bas, à la maison sans matériel), la prochaine séance proposée automatiquement
- Séance guidée : les séries à cocher, un minuteur de repos, la charge de chaque exercice, la durée, puis l'historique de tes séances

## [0.4.0] - 2026-11-16

Les repas arrivent : un aliment en trois taps, ton objectif calorique en un coup d'œil et des recettes à partager

### Ajouté
- Onglet Repas : tes calories du jour face à ton objectif dans un anneau, tes protéines, glucides et lipides, et tes quatre repas
- Trois sources d'aliments dans une seule recherche : tes aliments, les aliments du quotidien de la table Ciqual (ANSES) et les produits du commerce d'Open Food Facts
- Scan du code-barres d'un produit avec l'appareil photo, ou saisie du code à la main
- Création d'aliments à la main, gardés dans ton compte, quand un produit est introuvable
- Quantité au gramme, à la portion ou à la part, avec les calories qui se mettent à jour en direct
- Récents en haut de la recherche, et « Comme hier » pour reprendre un repas de la veille
- Nutri-Score de chaque aliment : l'officiel pour les produits du commerce, estimé à partir des nutriments pour les autres
- Recettes : ingrédients pesés, nombre de parts, photo et préparation, calories et nutriments par part calculés pour toi
- Recettes de la communauté : partage les tiennes, note celles des autres, copie-les dans tes recettes, filtre par type de repas
- Les calories du jour sur l'écran Aujourd'hui
- Administration : mise à jour de la table Ciqual en un bouton, avec sa progression en direct et l'historique des versions. Les anciennes versions sont conservées : les repas déjà notés ne changent jamais

## [0.3.0] - 2026-11-16

Les photos arrivent : une par jour, toujours le même cadrage, et ton année qui défile en quelques secondes

### Ajouté
- Onglet Photos : la photo du jour, toutes tes photos mois par mois, de face, de profil ou de dos
- Caméra plein écran avec le calque de ta dernière photo pour garder le même cadrage, un retardateur de 3 ou 10 secondes et le choix de la caméra, ou une photo importée depuis ta galerie
- Comparateur avant / après : un curseur à faire glisser ou les deux photos côte à côte, avec les jours d'écart et les kilos de différence
- Time-lapse de ta transformation, avec la date et le poids de chaque jour, exportable en vidéo
- La photo du jour apparaît dans ta journée sur l'écran Aujourd'hui
- Espace de stockage affiché sous tes photos, et quota réglable par compte pour les administrateurs

### Sécurité
- Chaque photo est redessinée et réenregistrée en WebP : aucune donnée cachée du fichier d'origine n'est conservée, pas même la position GPS
- Tes photos ne sont visibles que par toi, administrateurs compris
- Nombre d'envois limité par heure

## [0.2.0] - 2026-11-16

Le suivi arrive : ton point de départ, ta pesée du jour, ta courbe et la date à laquelle tu atteindras ton objectif. Et une app bien plus vivante

### Ajouté
- Parcours de bienvenue en quatre étapes : toi, ton point de départ (taille, poids), ton objectif (poids visé, rythme, activité), puis ton plan
- Plan personnalisé : objectif calorique calculé avec la formule de Mifflin-St Jeor, plancher de sécurité, date d'arrivée estimée
- Pesée du jour depuis l'écran Aujourd'hui, avec des boutons − / + à garder appuyés et le clavier numérique, et des mensurations facultatives (tour de taille, hanches, poitrine, bras, cuisse, masse grasse)
- Flamme calculée sur tes vraies pesées, avec la semaine en cours jour par jour
- Onglet Progrès : courbe de poids avec la tendance lissée, l'objectif et la prévision, sur 1 mois, 3 mois ou depuis le début, chiffres clés et historique modifiable
- Page « Mon objectif » dans le profil pour changer de poids visé, de rythme, d'activité ou de taille
- Garde-fous : objectif refusé sous un IMC de 18,5, rythme rapide signalé, âge minimum vérifié
- Animations partout : transition circulaire au changement de thème, transitions entre les pages du site, contenus qui apparaissent en cascade, éléments du site qui s'animent au défilement
- Nouvelle barre d'onglets flottante, avec un indicateur qui glisse d'un onglet à l'autre
- Message « Nouvelle version prête » dans l'app installée, pour mettre à jour sans se reconnecter

### Modifié
- Page d'accueil : le chiffre 365 et un exemple de série avec les journées validées, les jours gelés et aujourd'hui
- Le bouton principal du site dit simplement « Installer l'application »
- Parcours du site : nouvelles vignettes, avant / après à faire glisser, année en douze secondes qui se lit vraiment, cadenas pour la vie privée
- Calendrier de la série aux couleurs pastel, nombre de jours dans une pastille plus lisible
- Graphique du jour 90 redessiné : pesées, tendance lissée, prévision jusqu'à l'objectif et légende
- Sur téléphone, le parcours prend toute la largeur : le jour s'affiche dans une pastille au-dessus du titre
- Le grand 365 de la dernière carte s'affiche en entier, sous le bouton sur téléphone
- FAQ plus claire sur l'âge minimum et sur les notifications
- Le code est publié sous licence MIT

### Corrigé
- Sur ordinateur, l'apparition de la barre de défilement ne décale plus la page
- Le 365 de la page d'accueil n'est plus coupé à droite, et le calendrier ne dépasse plus de sa carte
- Les liens du menu (Le parcours, Vie privée, FAQ) s'arrêtent juste sous la barre, sans la faire bouger
- Les ombres des vignettes du parcours ne sont plus coupées
- Les onglets du guide d'installation tiennent sur les petits écrans
- Dans le parcours de bienvenue, l'objectif proposé part de ton poids réel (5 kg de moins)
- Sur l'écran Aujourd'hui, le poids visé ne se coupe plus sur deux lignes
- La page d'accueil s'affiche plus vite : le grand 365 est visible dès le premier affichage

## [0.1.0] - 2026-11-16

Première version : le socle de l'application, avant le suivi du poids, des photos et des repas

### Ajouté
- Site de présentation en français et en anglais : un compteur « Jour 001 » et une grille de 365 points qui se remplissent au fil de la page, puis le parcours d'une année, du jour 0 au jour 365
- Guide d'installation pas à pas pour Android, iPhone, iPad et ordinateur, qui reconnaît ton appareil, et installation en un clic sur Chrome et Edge quand le navigateur le permet
- Application installable (PWA) qui s'ouvre directement sur l'écran de connexion depuis son icône
- Navigation comme dans une app native : les écrans s'empilent en glissant depuis la droite, le retour les fait repartir, et un balayage depuis le bord gauche ramène à l'écran précédent
- Connexion avec Google ou avec une passkey (Face ID, empreinte, code du téléphone)
- Écran « Demander un accès » à la place du mot de passe oublié, et demande de lien de récupération pour qui a perdu l'accès à son compte
- Liens d'invitation et de récupération valables 24 h, à usage unique, révocables à tout moment par un administrateur
- Deux confirmations au premier lancement : avoir 18 ans ou plus, et accepter le traitement des données de santé
- Écran Aujourd'hui avec la flamme et la journée à venir, onglets Repas, Photos et Progrès en préparation
- Profil : prénom, langue, thème automatique, clair ou sombre, gestion des passkeys et du compte Google, suppression du compte
- Espace administrateur dans l'application : comptes et rôles, demandes d'accès, liens actifs, journal de toutes les actions des admins
- Pages légales : mentions légales avec les crédits des polices et des icônes, politique de confidentialité, conditions d'utilisation
- Bouton clair / sombre sur le site, et cette page Nouveautés

### Corrigé
- Sur ordinateur, l'app installée depuis le site bascule tout de suite sur l'écran de connexion au lieu de rester sur la page d'accueil

### Sécurité
- Accès sur invitation uniquement, réservé aux personnes majeures
- Politique de sécurité du contenu stricte, protection contre la falsification de requêtes et limitation du nombre de tentatives
- Session gardée 90 jours sur l'appareil, fermée immédiatement si un compte est suspendu
- Les liens d'accès ne sont jamais stockés en clair et disparaissent de la barre d'adresse dès leur ouverture
