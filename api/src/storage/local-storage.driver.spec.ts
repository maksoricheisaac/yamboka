import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageDriver } from './local-storage.driver';
import { assertSafeKey } from './storage-driver';

describe('LocalStorageDriver', () => {
  let dir: string;
  let storage: LocalStorageDriver;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'yamboka-storage-'));
    storage = new LocalStorageDriver(dir);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('écrit, relit, vérifie l’existence puis supprime', async () => {
    await storage.put('inputs/u1/a.txt', Buffer.from('salut'));
    expect(await storage.exists('inputs/u1/a.txt')).toBe(true);
    expect((await storage.get('inputs/u1/a.txt')).toString()).toBe('salut');
    await storage.delete('inputs/u1/a.txt');
    expect(await storage.exists('inputs/u1/a.txt')).toBe(false);
  });

  it('supprimer un objet absent ne produit pas d’erreur', async () => {
    await expect(storage.delete('inputs/absent.txt')).resolves.toBeUndefined();
  });

  it('ne fournit pas d’URL signée', async () => {
    expect(await storage.signedUrl()).toBeNull();
  });

  it('le diagnostic réussit sur un dossier inscriptible', async () => {
    expect((await storage.diagnose()).ok).toBe(true);
  });

  it('refuse les clés qui sortent du dossier', async () => {
    for (const key of [
      '../x',
      'a/../../x',
      '/etc/passwd',
      'a\\b',
      'a//b',
      '',
    ]) {
      expect(() => assertSafeKey(key)).toThrow();
    }
    await expect(storage.put('../evil', Buffer.from('x'))).rejects.toThrow();
  });
});
