/**
 * Modèles d'e-mails (HTML + texte brut), en français, aux couleurs de Yamboka.
 * Fonctions pures : aucune lecture de configuration ni d'envoi ici, ce qui les rend testables.
 * Mise en page en tableaux et styles en ligne : seule approche fiable dans les clients de messagerie.
 * Règles : jamais de mot de passe, jamais de donnée financière au-delà du strict nécessaire.
 */

const GREEN = '#0f5a46';
const AMBER = '#f2b632';
const INK = '#1b2a24';
const MUTED = '#5b6b64';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

interface Block {
  title: string;
  /** Paragraphes d'introduction. */
  paragraphs: string[];
  /** Mise en avant centrale (code, montant). */
  highlight?: string;
  /** Lignes « libellé : valeur » (reçu). */
  details?: [string, string][];
  cta?: { label: string; url: string };
  footnote?: string;
}

function render(subject: string, b: Block): RenderedEmail {
  const textParts = [b.title, '', ...b.paragraphs.flatMap((p) => [p, ''])];
  if (b.highlight) textParts.push(b.highlight, '');
  if (b.details)
    textParts.push(...b.details.map(([k, v]) => `${k} : ${v}`), '');
  if (b.cta) textParts.push(`${b.cta.label} : ${b.cta.url}`, '');
  if (b.footnote) textParts.push(b.footnote, '');
  textParts.push('— L’équipe Yamboka');

  const paragraphs = b.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:${INK}">${esc(p)}</p>`,
    )
    .join('');
  const highlight = b.highlight
    ? `<p style="margin:8px 0 20px;text-align:center"><span style="display:inline-block;background:#eef6f2;border:1px solid #cfe3da;border-radius:12px;padding:14px 22px;font-family:'Courier New',monospace;font-size:32px;letter-spacing:8px;font-weight:700;color:${GREEN}">${esc(b.highlight)}</span></p>`
    : '';
  const details = b.details
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-top:1px solid #e3ebe7">${b.details
        .map(
          ([k, v]) =>
            `<tr><td style="padding:9px 0;border-bottom:1px solid #e3ebe7;font-size:14px;color:${MUTED}">${esc(k)}</td><td align="right" style="padding:9px 0;border-bottom:1px solid #e3ebe7;font-size:14px;font-weight:600;color:${INK}">${esc(v)}</td></tr>`,
        )
        .join('')}</table>`
    : '';
  const cta = b.cta
    ? `<p style="margin:8px 0 18px"><a href="${esc(b.cta.url)}" style="display:inline-block;background:${GREEN};color:#ffffff;padding:13px 22px;border-radius:10px;font-size:16px;font-weight:600;text-decoration:none">${esc(b.cta.label)}</a></p><p style="margin:0 0 14px;font-size:13px;color:${MUTED};word-break:break-all">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${esc(b.cta.url)}</p>`
    : '';
  const footnote = b.footnote
    ? `<p style="margin:0;font-size:13px;line-height:1.5;color:${MUTED}">${esc(b.footnote)}</p>`
    : '';

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ea">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
<tr><td style="background:${GREEN};padding:18px 28px"><span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px">Yamboka</span><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${AMBER};margin-left:6px"></span></td></tr>
<tr><td style="padding:28px 28px 24px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${INK}">${esc(b.title)}</h1>
${paragraphs}${highlight}${details}${cta}${footnote}
</td></tr>
<tr><td style="padding:16px 28px;background:#faf8f3;font-size:12px;color:${MUTED}">Yamboka — créez des vidéos et des images par IA, payez en Mobile Money.<br>Vous recevez cet e-mail car une action a été effectuée avec votre adresse sur Yamboka.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text: textParts.join('\n'), html };
}

export type OtpKind = 'VERIFY_EMAIL' | 'LOGIN' | 'SENSITIVE_ACTION';

const OTP_COPY: Record<
  OtpKind,
  { subject: string; title: string; lead: string; ignore: string }
> = {
  VERIFY_EMAIL: {
    subject: 'Votre code de vérification — Yamboka',
    title: 'Confirmez votre adresse e-mail',
    lead: 'Saisissez ce code dans Yamboka pour confirmer votre adresse et activer votre compte.',
    ignore:
      'Si vous n’êtes pas à l’origine de cette inscription, ignorez cet e-mail.',
  },
  LOGIN: {
    subject: 'Votre code de connexion — Yamboka',
    title: 'Confirmez votre connexion',
    lead: 'Quelqu’un se connecte à votre compte. Saisissez ce code pour terminer la connexion.',
    ignore:
      'Si ce n’est pas vous, ignorez cet e-mail et changez votre mot de passe : le code seul ne permet pas de se connecter.',
  },
  SENSITIVE_ACTION: {
    subject: 'Votre code de confirmation — Yamboka',
    title: 'Confirmez cette action',
    lead: 'Saisissez ce code pour confirmer l’opération sensible demandée sur votre compte.',
    ignore: 'Si vous n’avez rien demandé, ignorez cet e-mail.',
  },
};

export function otpEmail(
  firstName: string | null,
  code: string,
  purpose: OtpKind,
  ttlMinutes: number,
): RenderedEmail {
  const c = OTP_COPY[purpose];
  return render(c.subject, {
    title: firstName ? `${c.title}, ${firstName}` : c.title,
    paragraphs: [
      c.lead,
      `Ce code est valable ${ttlMinutes} minutes et ne peut servir qu’une seule fois.`,
    ],
    highlight: code,
    footnote: `Ne communiquez jamais ce code, même à quelqu’un qui se dit de Yamboka. ${c.ignore}`,
  });
}

export function passwordResetEmail(
  firstName: string,
  url: string,
): RenderedEmail {
  return render('Réinitialisation de votre mot de passe — Yamboka', {
    title: 'Réinitialisation de votre mot de passe',
    paragraphs: [
      `Bonjour ${firstName}, vous avez demandé à choisir un nouveau mot de passe.`,
      'Ce lien est valable 1 heure et ne peut servir qu’une seule fois.',
    ],
    cta: { label: 'Choisir un nouveau mot de passe', url },
    footnote:
      'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.',
  });
}

export interface PurchaseReceipt {
  packName: string;
  credits: number;
  amountFcfa: number;
  reference: string;
  paidAt: Date;
}

const fcfa = (n: number) =>
  `${new Intl.NumberFormat('fr-FR').format(n).replace(/[\u202f\u00a0]/g, ' ')} FCFA`;

/** Confirmation d'achat et reçu : le numéro de téléphone du payeur n'y figure volontairement pas. */
export function purchaseEmail(
  firstName: string,
  r: PurchaseReceipt,
  url: string,
): RenderedEmail {
  const date = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Africa/Brazzaville',
  }).format(r.paidAt);
  return render('Achat confirmé — vos crédits sont disponibles', {
    title: 'Achat confirmé',
    paragraphs: [
      `Merci ${firstName}. Votre paiement a bien été reçu et ${r.credits} crédits ont été ajoutés à votre compte.`,
    ],
    details: [
      ['Pack', r.packName],
      ['Crédits ajoutés', String(r.credits)],
      ['Montant payé', fcfa(r.amountFcfa)],
      ['Date', date],
      ['Référence', r.reference],
    ],
    cta: { label: 'Créer ma première vidéo', url },
    footnote: 'Conservez cet e-mail comme reçu de paiement.',
  });
}

export function generationEmail(
  firstName: string,
  result:
    { ok: true; url: string } | { ok: false; refunded: boolean; url: string },
): RenderedEmail {
  if (result.ok) {
    return render('Votre création est prête — Yamboka', {
      title: 'Votre création est prête',
      paragraphs: [
        `Bonne nouvelle ${firstName} : votre création est terminée. Vous pouvez la télécharger.`,
      ],
      cta: { label: 'Voir ma création', url: result.url },
      footnote:
        'Pensez à la télécharger : les fichiers sont conservés pendant une durée limitée.',
    });
  }
  return render('Votre création n’a pas abouti — Yamboka', {
    title: 'Votre création n’a pas abouti',
    paragraphs: [
      `Bonjour ${firstName}, nous n’avons pas pu terminer votre création.`,
      result.refunded
        ? 'Les crédits utilisés vous ont été rendus : vous pouvez réessayer.'
        : 'Contactez-nous si les crédits ne vous ont pas été rendus.',
    ],
    cta: { label: 'Réessayer', url: result.url },
  });
}

export function accountNoticeEmail(
  firstName: string,
  title: string,
  message: string,
): RenderedEmail {
  return render(`${title} — Yamboka`, {
    title,
    paragraphs: [`Bonjour ${firstName},`, message],
    footnote:
      'Pour toute question, répondez à cet e-mail ou contactez-nous depuis votre espace.',
  });
}
