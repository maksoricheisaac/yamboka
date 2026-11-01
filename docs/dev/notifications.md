# Notifications, préférences et e-mails

## Principe

Un événement réel (fin de création, échec, remboursement, paiement) appelle `NotificationsService.notify` **dans la
transaction de l'événement**. La notification dans l'application est toujours créée. L'e-mail dépend de la préférence
de l'utilisateur ET de la vérification de son adresse ; il est envoyé **après** la validation de la transaction
(`dispatchEmail`) : une panne d'e-mail ne peut pas défaire une création ou un paiement.

| Événement | Type | Clé d'idempotence | Préférence d'e-mail |
|---|---|---|---|
| Création terminée | `GENERATION_READY` | `gen-ready:<id>` | `generationReady` |
| Création échouée | `GENERATION_FAILED` | `gen-failed:<id>` | `generationFailed` |
| Crédits restitués | `CREDITS_REFUNDED` | `refund:<id>` | `creditsRefunded` |
| Paiement confirmé | `PAYMENT_SUCCESS` | `payment-ok:<id>` | `paymentConfirmed` (e-mail de reçu) |
| Paiement échoué / annulé | `PAYMENT_FAILED` | `payment-failed:<id>` | aucune (notification interne seulement) |

- **Doublons** : `Notification.dedupKey` est unique ; un événement rejoué (callback en double, suivi relancé) ne crée rien.
- **Reprise** : en cas d'échec d'envoi, l'erreur est consignée (`emailError`, `emailAttempts`) ; la tâche BullMQ
  `flush-notification-emails` (chaque minute) réessaie avec un délai de n × 2 min, 5 essais maximum, dans les 24 h.
  Sans Redis (tests), l'envoi est tenté tout de suite, sans reprise automatique.
- La préférence est relue au moment de l'envoi : désactivée entre-temps, l'e-mail ne part pas.
- Aucun e-mail vers une adresse non vérifiée. Les secrets d'envoi restent côté API (SMTP, voir `emails-et-otp.md`).

## API

`GET /v1/notifications?limit&cursor`, `POST /v1/notifications/:id/read`, `POST /v1/notifications/read` (toutes),
`GET|PATCH /v1/preferences` (`{ emailPrefs: { generationReady?, … } }`, renvoie les valeurs enregistrées).
Tout est borné à l'utilisateur connecté. Préférences par défaut d'un nouveau compte : tout activé (`User.emailPrefs` null).

## Tendances à la une

`Preset.featured` est distinct de `Preset.visible` (publication). `PATCH /v1/admin/presets/:id/featured`
(`{ featured, reason }`, administrateur seulement, audité `preset.feature` / `preset.unfeature`) ; la mise à la une
d'un preset non publié est refusée (`PRESET_NOT_PUBLISHED`). La page Tendances affiche « À la une » uniquement s'il existe
des presets mis en avant ; le catalogue général reste filtrable.
