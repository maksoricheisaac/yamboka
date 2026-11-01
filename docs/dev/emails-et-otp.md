# E-mails transactionnels et codes à usage unique (OTP)

## Fournisseurs d'e-mail

| `EMAIL_PROVIDER` | Comportement |
|---|---|
| `console` (défaut) | **Aucun e-mail réel.** Les messages restent en mémoire (100 derniers) ; le journal n'affiche que le sujet, jamais le corps ni les codes. Lecture en développement : `GET /v1/dev/outbox?to=<email>` (absent en production). |
| `smtp` | Envoi réel via nodemailer. `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` obligatoires (validé au démarrage). |

Variables (toutes lues côté serveur, jamais exposées au navigateur) :

| Variable | Rôle | Défaut |
|---|---|---|
| `EMAIL_FROM` | Expéditeur, ex. `Yamboka <no-reply@votre-domaine>` | `Yamboka <no-reply@yamboka.local>` |
| `EMAIL_REPLY_TO` | Adresse de réponse (facultatif) | — |
| `SMTP_HOST` / `SMTP_PORT` | Serveur et port | — / `587` |
| `SMTP_SECURE` | `true` : TLS implicite (port 465). `false` : STARTTLS (port 587) | `false` |
| `SMTP_USER` / `SMTP_PASSWORD` | Identifiants fournis par votre hébergeur de messagerie | — |
| `EMAIL_OTP_LENGTH` | Nombre de chiffres du code | `6` |
| `EMAIL_OTP_TTL_MINUTES` | Validité | `10` |
| `EMAIL_OTP_MAX_ATTEMPTS` | Essais avant invalidation du code | `5` |
| `EMAIL_OTP_RESEND_COOLDOWN_SECONDS` | Délai avant un nouvel envoi | `60` |
| `EMAIL_OTP_MAX_SENDS_PER_HOUR` | Envois par adresse, par objectif et par heure | `5` |

**Où trouver les paramètres SMTP.** Dans l'espace d'administration de votre hébergeur de messagerie (cPanel, Zoho, Google Workspace, OVH, Brevo, Mailjet…), rubrique « Paramètres SMTP » / « Client de messagerie ». Aucune valeur de ce dépôt n'est un vrai identifiant. Le port 25 (sans chiffrement) est refusé en production.

### Garanties de sécurité

- Le transport impose **STARTTLS** quand `SMTP_SECURE=false` (jamais d'envoi en clair) ; délais de connexion 10 s, de dialogue 20 s.
- Les erreurs du transport sont **classées** (`auth`, `connection`, `timeout`, `rejected`) sans reprendre leur texte (qui peut citer l'hôte ou l'identifiant). Ni mot de passe, ni code, ni jeton complet n'est journalisé.
- **Jamais « envoyé » sans l'être.** Si l'envoi d'un code échoue : le code est supprimé, l'API répond `503 EMAIL_UNAVAILABLE` et l'interface le dit. À l'inscription, le compte est créé mais la réponse contient `emailSent: false` ; l'utilisateur peut corriger l'adresse ou redemander le code.
- Au démarrage, un avertissement est journalisé si le domaine de `EMAIL_FROM` diffère de celui de `SMTP_USER`.

### Tester la configuration

```bash
pnpm --filter api email:test                  # connexion + authentification SMTP (sans envoyer)
pnpm --filter api email:test vous@exemple.com # + message de test
```

Dans l'administration : **Paramètres → Tester l'envoi d'e-mails** (vérifie le transport puis envoie un message à l'adresse de l'administrateur connecté — jamais à une adresse libre). Le Setup Wizard affiche aussi cet état à l'étape de configuration.

### SPF, DKIM, DMARC (à créer chez l'hébergeur DNS du domaine)

Sans ces trois enregistrements, vos messages arrivent en courrier indésirable. Les valeurs exactes sont fournies par votre fournisseur de messagerie ; la forme générale :

| Type | Nom | Contenu (exemple de forme) |
|---|---|---|
| TXT (SPF) | `@` | `v=spf1 include:<serveur-spf-du-fournisseur> ~all` |
| TXT ou CNAME (DKIM) | `<sélecteur>._domainkey` | clé publique donnée par le fournisseur |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@votre-domaine` — passer à `quarantine` puis `reject` après quelques semaines sans anomalie |

Vérification : envoyer un message de test à une adresse Gmail → « Afficher l'original » → SPF, DKIM, DMARC doivent indiquer **PASS**. **Ces enregistrements n'ont pas pu être vérifiés depuis le dépôt : ils dépendent de votre domaine.**

## Codes à usage unique

Table `EmailOtp` (migration `otp_install_state_public_packs`). Un code est lié à **une adresse et un objectif** : `VERIFY_EMAIL`, `LOGIN`, `SENSITIVE_ACTION`.

- Généré par `crypto.randomInt` (CSPRNG), `EMAIL_OTP_LENGTH` chiffres.
- **Jamais stocké en clair** : seul un HMAC-SHA256 (clé `SESSION_SECRET`, lié à l'objectif et à l'adresse) est conservé. Changer `SESSION_SECRET` invalide les codes en cours.
- Un nouveau code **invalide les précédents**. Usage unique : la consommation est une réclamation atomique (`UPDATE … WHERE usedAt IS NULL`), donc deux requêtes parallèles avec le bon code ne passent qu'une fois.
- Chaque vérification **consomme d'abord une tentative** (atomiquement) : des requêtes parallèles ne permettent pas de dépasser `EMAIL_OTP_MAX_ATTEMPTS`. Au dernier essai raté, le code est invalidé.
- Anti-abus : délai entre deux envois (`429 OTP_COOLDOWN`, avec `details.retryAfterSeconds`), plafond horaire (`429 OTP_RATE_LIMIT`), et limitation de débit HTTP par IP + e-mail.

### Parcours qui l'utilisent

| Parcours | Routes | Notes |
|---|---|---|
| **Vérification de l'adresse** (remplace le lien de 24 h) | `POST /auth/verify-email {code}`, `POST /auth/resend-verification`, `POST /auth/change-email` | Le compte est connecté dès l'inscription ; la page `/verifier-email` saisit le code, affiche un compte à rebours de renvoi et permet de **corriger l'adresse** tant qu'elle n'est pas vérifiée. Aucun crédit n'est offert à la vérification. |
| **Confirmation de connexion** | `POST /auth/login` → `{otpRequired}`, puis `POST /auth/login/verify {email, code}` (renvoi : `POST /auth/login/resend`) | Réglage **Paramètres → Sécurité de connexion** (`loginOtpMode`) : `off` (défaut), `admin` (administrateurs seulement) ou `all`. Le mot de passe est vérifié **avant** l'envoi du code ; **aucune session n'est ouverte avant le code**. |
| **Opération sensible** | objectif `SENSITIVE_ACTION` | Pris en charge par le service (`OtpService`) mais **aucune opération ne l'exige encore**. |

Les comptes **Google** ne passent pas par un code supplémentaire : leur adresse est déjà vérifiée par Google (contrôles OAuth inchangés : `state`, PKCE, `email_verified`).

**Lien de vérification supprimé** : un seul système (le code). Les anciens liens `VERIFY_EMAIL` en attente ne fonctionnent plus ; le type d'enum reste en base pour compatibilité. La réinitialisation du mot de passe reste un **lien** (1 h, usage unique), car elle ne dépend pas d'une session.

## Modèles d'e-mails

`api/src/email/templates.ts` (fonctions pures, testées). HTML responsive en tableaux et styles en ligne + texte brut, en français, aux couleurs de Yamboka. Aucun mot de passe, aucun numéro de téléphone ni donnée bancaire.

| Modèle | Déclencheur |
|---|---|
| Code de vérification / de connexion / de confirmation | `OtpService.issue` |
| Réinitialisation du mot de passe | mot de passe oublié |
| Confirmation d'achat et reçu | paiement confirmé (une seule fois : seul l'appelant qui crédite envoie) ; un échec d'e-mail n'annule jamais un paiement |
| Notification de compte | suspension, bannissement, réactivation, accès administrateur accordé |
| Génération terminée / échouée | **modèle prêt, non déclenché** : le module de génération n'existe pas encore |
