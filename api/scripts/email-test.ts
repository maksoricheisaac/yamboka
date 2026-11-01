import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { validateEnv, type Env } from '../src/config/env';
import { SmtpEmailProvider } from '../src/email/smtp-email.provider';
import { accountNoticeEmail } from '../src/email/templates';

/**
 * Vérifie la configuration SMTP sans démarrer l'API.
 *   pnpm --filter api email:test                    → connexion + authentification
 *   pnpm --filter api email:test vous@exemple.com   → + envoi d'un message de test
 * N'affiche jamais le mot de passe, l'hôte ni l'utilisateur.
 */
async function main() {
  const env = validateEnv(process.env);
  if (env.EMAIL_PROVIDER !== 'smtp') {
    console.error(
      'EMAIL_PROVIDER n’est pas « smtp » : rien à tester (mode console, aucun e-mail réel).',
    );
    process.exit(2);
  }
  const provider = new SmtpEmailProvider(
    new ConfigService<Env, true>(env as unknown as Record<string, unknown>),
  );

  const diag = await provider.diagnose();
  console.log(`${diag.ok ? '✔' : '✘'} ${diag.detail}`);
  if (!diag.ok) process.exit(1);

  const to = process.argv[2];
  if (!to) return;
  try {
    await provider.send({
      to,
      ...accountNoticeEmail(
        'administrateur',
        'Test de configuration e-mail',
        'Si vous lisez ce message, l’envoi d’e-mails depuis Yamboka fonctionne.',
      ),
    });
    console.log(`✔ Message de test envoyé à ${to}.`);
  } catch (e) {
    console.error(
      `✘ Envoi refusé (${(e as { reason?: string }).reason ?? 'inconnu'}). Vérifiez EMAIL_FROM et le domaine autorisé.`,
    );
    process.exit(1);
  }
}

void main();
