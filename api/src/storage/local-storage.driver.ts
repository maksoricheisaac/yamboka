import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  assertSafeKey,
  StorageDiagnosis,
  StorageDriver,
  StorageUnavailableError,
} from './storage-driver';

/** Stockage sur disque (STORAGE_DRIVER=local) : développement et tests, jamais en production. */
export class LocalStorageDriver extends StorageDriver {
  readonly name = 'local';
  private readonly root: string;

  constructor(directory: string) {
    super();
    this.root = resolve(directory);
  }

  private path(key: string): string {
    assertSafeKey(key);
    return join(this.root, ...key.split('/'));
  }

  async put(key: string, body: Buffer): Promise<void> {
    const file = this.path(key);
    try {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, body);
    } catch (e) {
      throw new StorageUnavailableError((e as Error).message);
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.path(key));
    } catch (e) {
      throw new StorageUnavailableError((e as Error).message);
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.path(key));
      return true;
    } catch {
      return false;
    }
  }

  signedUrl(): Promise<string | null> {
    return Promise.resolve(null);
  }

  async diagnose(): Promise<StorageDiagnosis> {
    const key = `diagnostic/${randomUUID()}.txt`;
    try {
      await this.put(key, Buffer.from('yamboka'));
      const back = (await this.get(key)).toString();
      await this.delete(key);
      return back === 'yamboka'
        ? { ok: true, detail: `Stockage local opérationnel (${this.root}).` }
        : { ok: false, detail: 'Le contenu relu diffère du contenu écrit.' };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }
}
