<p align="center">
  <img src="docs/readme/banner.png" alt="MyBody365 : un an pour changer de corps" width="100%">
</p>

<h1 align="center">MyBody365</h1>

<p align="center">
  <b>365 jours pour transformer ton corps.</b><br>
  Une pesée, une photo, tes repas : quelques secondes par jour, et une app qui te montre le chemin parcouru<br>
  et le jour où tu atteindras ton objectif.
</p>

<p align="center">
  <a href="https://mybody365.mbonnici.fr"><b>Découvrir et installer</b></a> ·
  <a href="https://mybody365.mbonnici.fr/changelog">Nouveautés</a> ·
  <a href="#déploiement">Héberger</a>
</p>

<p align="center">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-installable-ff7a1a?style=flat-square">
  <img alt="Licence MIT" src="https://img.shields.io/badge/licence-MIT-3a46db?style=flat-square">
  <img alt="Angular 22" src="https://img.shields.io/badge/Angular-22-dd0031?style=flat-square&logo=angular&logoColor=white">
  <img alt="Spring Boot 4.1" src="https://img.shields.io/badge/Spring%20Boot-4.1-6db33f?style=flat-square&logo=springboot&logoColor=white">
  <img alt="Java 25" src="https://img.shields.io/badge/Java-25-e76f00?style=flat-square">
  <img alt="PostgreSQL 18" src="https://img.shields.io/badge/PostgreSQL-18-336791?style=flat-square&logo=postgresql&logoColor=white">
  <img alt="Lighthouse" src="https://img.shields.io/badge/Lighthouse-100%20a11y%20%C2%B7%20SEO%20%C2%B7%20BP-0cce6b?style=flat-square&logo=lighthouse&logoColor=white">
</p>

---

## Une année, jour après jour

On ne transforme pas son corps en trois semaines. MyBody365 est pensé pour tenir **un an** : un rituel du matin qui prend moins d'une minute, une flamme qu'on n'a pas envie d'éteindre, des amis qui avancent avec toi, et des photos qui finissent par raconter une vraie histoire.

<p align="center">
  <img src="docs/readme/journey.png" alt="Le site sur téléphone : le chiffre 365 et une série, le premier avant / après au jour 30, l'année entière au jour 365" width="100%">
</p>

| | |
|---|---|
| ⚖️ **Poids et prévision** | Ta courbe lissée, ta tendance réelle et la date estimée de ton objectif |
| 📸 **Photo du jour** | Un comparateur avant / après, puis le time-lapse de ton année |
| 🍽️ **Repas en trois taps** | Code-barres (Open Food Facts), aliments du quotidien (Ciqual), recettes perso, Nutri-Score |
| 🔥 **La flamme** | Chaque jour validé fait grandir ta série. Un jour manqué l'éteint |
| 🏋️ **Salle et séances** | Rappels aux heures de ta salle et programmes prêts à suivre |
| 👥 **Entre potes** | Suis la flamme de tes amis, partage tes recettes, envoie un rappel |

> Version **0.2.0** : le suivi du poids est là (parcours de bienvenue, plan calorique, pesée du jour, flamme, courbe, prévision). Les photos, les repas et les amis arrivent dans les prochaines versions, voir la [feuille de route](#feuille-de-route).

## L'app

Pensée **uniquement pour le téléphone** : barre d'onglets flottante, écrans qui s'empilent et se dépilent comme dans une app native, retour par balayage depuis le bord, thème qui bascule dans un cercle qui s'ouvre depuis le bouton, français et anglais.

<p align="center">
  <img src="docs/readme/app.png" alt="Écrans de l'app : objectif, aujourd'hui, progrès, administration" width="100%">
</p>

- **Un plan dès la première minute** : quatre questions (toi, ta taille et ton poids, ton objectif, ton rythme), puis un objectif calorique calculé avec Mifflin-St Jeor, un plancher de sécurité et une date d'arrivée estimée
- **Une pesée par jour** : boutons − / + à garder appuyés ou clavier numérique, mensurations facultatives, et la flamme qui grandit
- **Une courbe honnête** : la tendance lissée gomme les variations d'eau, la prévision se recalcule sur tes quatre dernières semaines
- **Connexion sans mot de passe** : Google ou passkey (Face ID, empreinte, code du téléphone)
- **Sur invitation** : on demande un accès depuis l'écran de connexion, un administrateur valide et envoie un lien d'invitation valable 24 h
- **Accès perdu ?** Un lien de récupération à usage unique permet d'ajouter une passkey ou de relier un autre compte Google
- **Administration dans l'app** : comptes et rôles, demandes d'accès, liens actifs révocables, journal de toutes les actions des admins

## Le site

Pas de « texte à gauche, capture à droite ». En haut de la page, le chiffre **365** et un exemple de série : les journées validées en vert, les jours gelés en glaçon, la flamme sur aujourd'hui. On comprend la promesse en une seconde, et le bouton dit simplement **Installer l'application**.

Le parcours suit ensuite les étapes clés, du jour 0 (l'installation) au jour 365, avec des vignettes qui se manipulent : un avant / après à faire glisser du doigt, l'année entière à lancer en lecture, un cadenas pour la vie privée. Les animations suivent le défilement, sans bibliothèque, et respectent le réglage « réduire les animations ».

<p align="center">
  <img src="docs/readme/site.png" alt="Le site de présentation sur ordinateur et sur téléphone" width="100%">
</p>

## Privé par défaut

- **Tes photos ne sont visibles que par toi.** Même les administrateurs ne les voient pas. Tu choisis, photo par photo, ce que tu partages avec un ami
- **Aucune pub, aucun traceur, aucune revente.** Deux cookies, strictement nécessaires : la session et la protection CSRF
- **Hébergé en France**, réservé aux personnes majeures, données de santé traitées avec un consentement explicite (RGPD art. 9)
- Les polices sont servies par le site lui-même : pas une requête vers Google Fonts

## Qualité

| | Résultat |
|---|---|
| Lighthouse, pages publiques (mobile, réseau bridé, processeur ralenti 4×) | Accessibilité **100** · Bonnes pratiques **100** · SEO **100** · Performance **72 à 85** selon les pages (LCP autour d'une seconde) |
| Tests back (JUnit + Testcontainers) | 31 tests : parcours d'accès, liens, rôles, suspension, CSRF, en-têtes, limitation de débit, calculs (Mifflin-St Jeor, tendance, prévision), suivi du poids |
| Tests front (Vitest) | 18 tests : traductions complètes FR / EN, plateformes, passkeys, erreurs, navigation |
| Tests de bout en bout (Playwright + axe-core) | 37 tests : site, installation, ancres du menu, connexion, invitations, admin, parcours de bienvenue, pesée, courbe, objectif, navigation en pile, accessibilité, débordements mobile |
| Sécurité | CSP stricte (`script-src 'self'` + deux empreintes), CSRF, cookie de session HttpOnly / SameSite / Secure, limitation par IP, journal admin |
| Sessions | Gardées en base (Spring Session JDBC) : une nouvelle version déployée ne déconnecte personne, et un compte suspendu est coupé tout de suite |

## Stack technique

```
Cloudflare ─► Traefik (Coolify, TLS) ─► nginx (app Angular + proxy /api) ─► Spring Boot ─► PostgreSQL
```

- **Front** : Angular 22 (signals, zoneless), service worker, pages publiques prérendues au build, nginx non root
- **Back** : Spring Boot 4.1 / Java 25, Spring Security 7 (OAuth2 Google + WebAuthn), Spring Session JDBC, Flyway
- **Base** : PostgreSQL 18
- **Design** : système maison (Archivo + Inter, accent « flamme »), icônes d'après Lucide, aucun framework CSS

## Déploiement

Le dépôt se déploie tel quel sur [Coolify](https://coolify.io) (Docker Compose).

1. **Google Cloud Console** › API et services › Identifiants › ID client OAuth (application Web)
   - Origine JavaScript autorisée : `https://mybody365.mbonnici.fr`
   - URI de redirection autorisée : `https://mybody365.mbonnici.fr/api/auth/oauth2/code/google`
2. **Coolify** : ressource *Docker Compose* sur ce dépôt, domaine sur le service **frontend**, port **8080**
3. **Variables obligatoires** (le déploiement s'arrête si l'une manque) :

   | Variable | Rôle |
   |---|---|
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Client OAuth Google |
   | `ADMIN_EMAILS` | Adresses Google toujours administrateurs, séparées par `;` |

   `SERVICE_USER_POSTGRES` et `SERVICE_PASSWORD_64_POSTGRES` sont générées par Coolify. Détails dans [.env.example](.env.example).

## Développer

Prérequis : Docker Desktop et Node 24. Java n'est pas nécessaire, le back se compile dans Docker.

```bash
docker compose -f docker-compose.local.yml up --build -d --wait
# site : http://localhost:4300   ·   app dans un onglet : http://localhost:4300/app?browser=1
```

L'app ne s'ouvre normalement qu'installée ; `?browser=1` lève cette restriction sur `localhost` uniquement, et les boutons « Connexion locale » permettent d'entrer sans Google.

```bash
cd frontend
npm test                         # tests unitaires
npx playwright install chromium
npm run e2e                      # bout en bout + accessibilité (stack locale démarrée)
```

Tests du back (PostgreSQL lancé par Testcontainers) :

```bash
cd backend
docker run --rm -v "$PWD:/app" -v "$HOME/.m2:/root/.m2" -v /var/run/docker.sock:/var/run/docker.sock \
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal -w /app eclipse-temurin:25-jdk-alpine ./mvnw -B test
```

Les images de ce README se régénèrent avec `frontend/scripts/screenshots.mjs` (le mode d'emploi est en tête du fichier).

## Feuille de route

| Version | Contenu | État |
|---|---|---|
| 0.1 | Socle : site, installation, comptes Google et passkeys, invitations, récupération, administration, pages légales | ✅ |
| 0.2 | Suivi : parcours de bienvenue, plan calorique, pesée et mensurations, flamme, courbe, tendance et prévision, objectif | ✅ |
| 0.3 | Photos : photo du jour (stockage S3, WebP, quotas), comparateur avant / après, time-lapse | 🔜 |
| 0.4 | Repas : Open Food Facts, Ciqual, aliments perso, recettes, Nutri-Score, recettes de la communauté | 🔜 |
| 0.5 | Engagement : gels de flamme, notifications quotidiennes, rappels salle, programmes | 🔜 |
| 0.6 | Amis : ajout par lien ou QR code, partage photo par photo, relances | 🔜 |
| 0.7 | Sauvegardes : Google Drive automatique, export, restauration avec aperçu des différences | 🔜 |

Le détail de chaque version est dans le [changelog](CHANGELOG.md), aussi publié sur le site.

## Crédits

Un projet de [Maxence Bonnici](https://mbonnici.fr), publié sous [licence MIT](LICENSE). Polices Inter et Archivo (SIL OFL 1.1), icônes d'après Lucide (ISC) : voir [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Mentions légales, confidentialité et conditions d'utilisation sur [le site](https://mybody365.mbonnici.fr/legal/mentions).
