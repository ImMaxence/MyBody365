# Changelog

Toutes les évolutions de MyBody365, de la plus récente à la plus ancienne. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et les numéros de version [SemVer](https://semver.org/lang/fr/). Cette page est aussi publiée sur le site, rubrique Nouveautés

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
