import {
  accountNoticeEmail,
  esc,
  otpEmail,
  passwordResetEmail,
  purchaseEmail,
} from './templates';

describe('modèles d’e-mails', () => {
  it('le code OTP figure en texte brut et en HTML, avec sa durée de validité', () => {
    const mail = otpEmail('Awa', '482915', 'VERIFY_EMAIL', 10);
    expect(mail.text).toMatch(/^482915$/m);
    expect(mail.html).toContain('482915');
    expect(mail.text).toContain('10 minutes');
    expect(mail.subject).toContain('code de vérification');
  });

  it('chaque objectif a son propre libellé', () => {
    expect(otpEmail(null, '123456', 'LOGIN', 10).subject).toContain(
      'connexion',
    );
    expect(otpEmail(null, '123456', 'SENSITIVE_ACTION', 10).subject).toContain(
      'confirmation',
    );
  });

  it('échappe le contenu injecté (prénom hostile)', () => {
    const mail = accountNoticeEmail(
      '<script>alert(1)</script>',
      'Titre',
      'Message',
    );
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&#60;script&#62;');
    expect(esc('"&')).toBe('&#34;&#38;');
  });

  it('le reçu n’expose ni numéro de téléphone ni donnée bancaire', () => {
    const mail = purchaseEmail(
      'Awa',
      {
        packName: 'Créateur',
        credits: 103,
        amountFcfa: 2500,
        reference: 'AB12CD34',
        paidAt: new Date('2026-10-23T10:00:00Z'),
      },
      'https://app.yamboka.test/app',
    );
    expect(mail.text).toContain('2 500 FCFA');
    expect(mail.text).toContain('AB12CD34');
    expect(mail.text).not.toMatch(/242\d{9}/);
  });

  it('le lien de réinitialisation est présent dans les deux formats, sans mot de passe', () => {
    const mail = passwordResetEmail(
      'Awa',
      'https://app.yamboka.test/nouveau-mot-de-passe?token=abc',
    );
    expect(mail.text).toContain('token=abc');
    expect(mail.html).toContain(
      'href="https://app.yamboka.test/nouveau-mot-de-passe?token=abc"',
    );
    expect(mail.html).toContain('viewport');
  });
});
