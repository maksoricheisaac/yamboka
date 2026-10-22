export interface FaqItem {
  q: string;
  a: string;
}

export const FAQ: FaqItem[] = [
  {
    q: 'Faut-il une carte bancaire ?',
    a: 'Non. Yamboka est conçu pour le paiement par mobile money (MTN Mobile Money et Airtel Money). Vous achetez des crédits à partir de 500 FCFA.',
  },
  {
    q: 'Comment fonctionnent les crédits ?',
    a: 'Un crédit vaut 25 FCFA. Vous achetez un pack, puis vous dépensez vos crédits à chaque création. Le coût exact est toujours affiché, en crédits et en FCFA, avant que vous ne confirmiez.',
  },
  {
    q: 'Combien coûte une vidéo ?',
    a: 'Une vidéo de 10 secondes en 480p coûte 40 crédits, soit 1 000 FCFA. Le prix dépend de la durée de votre vidéo, arrondie à la seconde supérieure. Une image coûte 2 crédits, soit 50 FCFA.',
  },
  {
    q: 'Que se passe-t-il si une création échoue ?',
    a: 'Vos crédits sont restitués automatiquement et vous êtes informé. Les crédits sont réservés au lancement et ne sont débités définitivement que si la création réussit.',
  },
  {
    q: 'Mes crédits expirent-ils ?',
    a: 'Les crédits achetés expirent 12 mois après leur achat. Les crédits de bienvenue expirent après 30 jours. Les crédits ne sont ni remboursables en argent, ni transférables entre comptes.',
  },
  {
    q: 'Combien de temps pour obtenir ma vidéo ?',
    a: 'La génération est asynchrone : vous pouvez quitter l’application et vous serez prévenu quand votre création est prête. Une génération qui n’aboutit pas dans l’heure est déclarée échouée et remboursée.',
  },
  {
    q: 'Combien de temps mes fichiers sont-ils conservés ?',
    a: 'Les vidéos et photos que vous envoyez sont supprimées 7 jours après la génération. Les créations générées sont conservées 90 jours, avec un rappel 7 jours avant leur suppression pour les télécharger.',
  },
  {
    q: 'Puis-je utiliser la photo de n’importe qui ?',
    a: 'Non. À chaque création, vous confirmez avoir le droit d’utiliser les images et que les personnes présentes ont donné leur accord. L’usurpation d’identité et les contenus trompeurs sont interdits.',
  },
  {
    q: 'Les vidéos portent-elles un filigrane ?',
    a: 'Oui, toutes les vidéos générées portent un filigrane discret de la plateforme.',
  },
  {
    q: 'Le paiement mobile money est-il déjà disponible ?',
    a: 'Le service est en phase de préparation. Le paiement par mobile money sera ouvert au lancement ; ce site ne propose aucun paiement réel pour le moment.',
  },
  {
    q: 'Yamboka est-il disponible hors du Congo ?',
    a: 'Le lancement vise le Congo-Brazzaville. L’ouverture à d’autres pays africains utilisant le mobile money est prévue ensuite.',
  },
];
