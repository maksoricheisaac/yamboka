# Site public : landing, navigation, animations, SEO

## Navigation

Barre flottante en capsule (`web/components/site/site-header.tsx`, `nav.tsx`) : logo (→ `/`), **Accueil**, **Exemples** (`/galerie`), **Fonctionnalités**, **Tarifs**, bouton thème, **Connexion** et **Créer mon compte** (→ application, inscription). Toutes les cibles sont des pages existantes. État actif signalé (`aria-current`, Accueil en correspondance exacte). Mobile : tiroir (Radix Dialog : focus piégé, Échap, lecteurs d'écran), refermé après chaque navigation. Barre collante : utile sur des pages longues (le CTA reste accessible) ; fond à 90 % d'opacité pour garder le contraste. Elle est distincte de la navigation de l'espace connecté.

« Comment ça marche » et « Cas d'usage » restent accessibles depuis le pied de page et les sections de l'accueil.

## Page d'accueil

Hero → Exemples (catégories filtrables) → Comment ça marche → Cas d'utilisation → Fonctionnalités → Tarifs (3 offres) → Sécurité et usage responsable → FAQ (8 questions) → CTA final → pied de page. Copywriting : problème puis bénéfice, phrases courtes, aucun témoignage, aucune statistique, aucun logo client inventés.

**Honnêteté sur l'état du service** : la génération et le paiement mobile money ne sont pas encore ouverts. Le hero porte « bientôt ouvert », les sections Tarifs et FAQ le précisent, et la démonstration est marquée *Aperçu illustratif — pas une création réelle*. Les vraies vidéos de démonstration restent à fournir.

## Offres : trois maximum

`web/content/offer.ts` lit `GET /v1/catalog/packs/public` (packs actifs **et** publiés dans l'administration, trois au maximum, une seule recommandée) avec un cache d'une minute. Si l'API est injoignable, retombée sur les valeurs du business plan (Starter 5 000, Pro 10 000 recommandé, Business 25 000 FCFA). Le rendu est côté serveur : les prix sont dans le HTML, sans JavaScript. Chaque offre : intitulé de rôle (*Pour essayer / Recommandé / Pour créer régulièrement*), prix en FCFA, crédits, exemple concret calculé, un bouton. Pas de tableau comparatif.

## Animations (Motion, successeur de Framer Motion)

La dépendance `motion` était déjà installée : réutilisée (`motion/react`, API identique). Module unique `web/components/motion/motion.tsx` :

- `LazyMotion` + composants `m` : seul le sous-ensemble d'animations de base est chargé ; `MotionConfig reducedMotion="user"` respecte `prefers-reduced-motion`.
- Variantes réutilisables : `rise` (montée au défilement), `stagger`, `hero`. Composants : `Reveal`, `Stagger`/`StaggerItem`, `HeroItem`, `HoverLift`, `TapScale`.
- **Le contenu n'est jamais masqué en attendant une animation** (pas d'opacité 0, déplacements de 14 à 18 px) : lisible sans JavaScript et pour les robots (testé).
- La démonstration du hero (`hero-demo.tsx`) se joue **une fois** (vidéo → photo → création) puis s'arrête ; avec « réduire les animations », seul le résultat final s'affiche. Aucune animation permanente.
- La scène 3D (three.js, react-three-fiber) du hero a été **supprimée** avec ses dépendances : lourde pour un smartphone d'entrée de gamme sur connexion lente.

## SEO

- `lib/seo.tsx` : `pageMetadata()` (titre, description, canonique, Open Graph, Twitter/X) appliqué à toutes les pages ; `JsonLd` (le `<` est neutralisé).
- Données structurées : `Organization` + `WebSite` + `FAQPage` (accueil), `FAQPage` (FAQ), `BreadcrumbList` (pages secondaires), `Product` + `Offer` sur Tarifs (prix et crédits **visibles sur la page**, devise XAF ; **ni note, ni avis**).
- `sitemap.xml` (12 pages publiques), `robots.txt` (avec la ligne `Sitemap:`), image de partage 1200×630 générée (`opengraph-image`, `twitter-image`), icône SVG. L'application privée est `noindex` (métadonnées) et son `robots.txt` interdit tout.
- Expressions visées, intégrées naturellement dans titres et textes : *vidéo IA*, *image IA*, *paiement mobile money*, *MTN Mobile Money / Airtel Money*, *Congo / Brazzaville*, *sans carte bancaire*. Pas de bourrage.
- Prévoir des guides : ajouter un dossier `web/app/(site)/guides/[slug]/` et les routes dans `sitemap.ts`.
- **Aucun score SEO ou de performance n'est annoncé** : aucune mesure Lighthouse/PageSpeed n'a été faite (à réaliser sur l'URL de production).
