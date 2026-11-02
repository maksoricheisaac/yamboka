export interface FaqItem {
  q: string;
  a: string;
}

/** Les huit premières questions sont celles de la page d'accueil. */
export const FAQ: FaqItem[] = [
  {
    q: 'Comment fonctionne Yamboka ?',
    a: 'Vous créez un compte, vous achetez des crédits, puis vous choisissez un style (affiche, vidéo pub ou tendance) et vous ajoutez votre photo. Le prix s’affiche avant que vous confirmiez. La création se fait en arrière-plan : vous pouvez quitter la page, vous la retrouverez dans « Mes créations ».',
  },
  {
    q: 'Comment payer sans carte bancaire ?',
    a: 'Avec MTN Mobile Money ou Airtel Money. Vous choisissez un pack à partir de 5 000 FCFA, saisissez votre numéro, puis confirmez le paiement sur votre téléphone. Aucune carte ni compte bancaire n’est nécessaire. Le paiement par mobile money est en cours de mise en service : ce site ne réalise aucun paiement réel pour le moment.',
  },
  {
    q: 'Combien coûte une génération ?',
    a: 'Les packs sont à prix tout compris (frais Mobile Money inclus) : Starter 5 000 FCFA pour 1 250 crédits, Pro 10 000 FCFA pour 2 600 crédits, Business 25 000 FCFA pour 6 800 crédits. Une vidéo de 10 secondes consomme 100 crédits (50 pour 5 secondes, durée arrondie à la seconde supérieure). Une image coûte 2 crédits. Le coût exact est toujours affiché avant de confirmer.',
  },
  {
    q: 'Combien de temps prend une création ?',
    a: 'Cela dépend de la durée de la vidéo et de l’affluence. Vous n’avez pas à attendre devant l’écran : vous êtes prévenu quand c’est prêt. Une création qui n’aboutit pas dans l’heure est déclarée échouée et vos crédits vous sont rendus.',
  },
  {
    q: 'Peut-on utiliser ses propres photos ?',
    a: 'Oui, c’est le principe : la photo de votre produit ou votre selfie. Les tendances et les styles sont fournis par Yamboka. À chaque création, vous confirmez avoir le droit d’utiliser votre photo et l’accord des personnes qui y figurent. L’usurpation d’identité et les contenus trompeurs sont interdits.',
  },
  {
    q: 'Comment récupérer une création ?',
    a: 'Depuis votre espace, vous téléchargez le fichier sur votre téléphone, puis vous le partagez sur WhatsApp, TikTok ou Facebook. Les vidéos portent un filigrane discret de la plateforme.',
  },
  {
    q: 'Combien de temps les fichiers sont-ils conservés ?',
    a: 'Les vidéos et photos que vous envoyez sont supprimées 7 jours après la génération. Les créations sont conservées 90 jours, avec un rappel 7 jours avant leur suppression pour les télécharger.',
  },
  {
    q: 'Que se passe-t-il si une génération échoue ?',
    a: 'Vos crédits sont restitués automatiquement et vous en êtes informé. Les crédits sont réservés au lancement de la création et ne sont débités définitivement que si elle réussit.',
  },
  {
    q: 'Mes crédits expirent-ils ?',
    a: 'Les crédits achetés expirent 12 mois après l’achat. Ils ne sont ni remboursables en argent, ni transférables entre comptes.',
  },
  {
    q: 'Yamboka est-il disponible hors du Congo ?',
    a: 'Le lancement vise le Congo-Brazzaville. L’ouverture à d’autres pays africains utilisant le mobile money est prévue ensuite.',
  },
];
