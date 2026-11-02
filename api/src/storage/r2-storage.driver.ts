import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Env } from '../config/env';
import {
  assertSafeKey,
  StorageDiagnosis,
  StorageDriver,
  StorageUnavailableError,
} from './storage-driver';

/** Traduit une erreur du SDK en message exploitable, sans jamais exposer d'identifiant. */
function explain(e: unknown): string {
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  switch (err.name) {
    case 'NoSuchBucket':
      return 'Bucket introuvable (R2_BUCKET_NAME).';
    case 'InvalidAccessKeyId':
    case 'SignatureDoesNotMatch':
      return 'Identifiants refusés (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).';
    case 'AccessDenied':
      return 'Accès refusé : le jeton R2 doit avoir le droit « Object Read & Write » sur ce bucket.';
    default:
      break;
  }
  const code = (e as { code?: string }).code;
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT') {
    return 'Connexion à R2 impossible (R2_ACCOUNT_ID, réseau, pare-feu).';
  }
  const http = err.$metadata?.httpStatusCode;
  const details = [err.name, http ? `HTTP ${http}` : undefined]
    .filter(Boolean)
    .join(', ');
  return details ? `Erreur R2 (${details}).` : 'Erreur R2.';
}

/** Cloudflare R2 (STORAGE_DRIVER=r2) via son API compatible S3. Bucket privé : URL signées uniquement. */
export class R2StorageDriver extends StorageDriver {
  readonly name = 'r2';
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    const accountId = config.get('R2_ACCOUNT_ID', { infer: true });
    this.bucket = config.get('R2_BUCKET_NAME', { infer: true });
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.get('R2_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('R2_SECRET_ACCESS_KEY', {
          infer: true,
        }),
      },
      // R2 ne gère pas les sommes de contrôle ajoutées par défaut par les versions récentes du SDK.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (e) {
      throw new StorageUnavailableError(explain(e));
    }
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    try {
      const out = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return Buffer.from(await out.Body!.transformToByteArray());
    } catch (e) {
      throw new StorageUnavailableError(explain(e));
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (e) {
      throw new StorageUnavailableError(explain(e));
    }
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (e) {
      const err = e as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw new StorageUnavailableError(explain(e));
    }
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    assertSafeKey(key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }

  async diagnose(): Promise<StorageDiagnosis> {
    const key = `diagnostic/${randomUUID()}.txt`;
    try {
      await this.put(key, Buffer.from('yamboka'), 'text/plain');
      const back = (await this.get(key)).toString();
      await this.delete(key);
      return back === 'yamboka'
        ? {
            ok: true,
            detail:
              'R2 opérationnel : écriture, lecture et suppression réussies.',
          }
        : { ok: false, detail: 'Le contenu relu diffère du contenu écrit.' };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }
}
