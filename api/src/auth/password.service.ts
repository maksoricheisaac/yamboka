import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

@Injectable()
export class PasswordService {
  /** Haché fictif pour égaliser le temps de réponse quand le compte n'existe pas. */
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(password);
  }

  async verify(
    passwordHash: string | null | undefined,
    password: string,
  ): Promise<boolean> {
    if (!passwordHash) {
      this.dummyHash ??= hash('yamboka-dummy-password');
      await verify(await this.dummyHash, password).catch(() => false);
      return false;
    }
    return verify(passwordHash, password).catch(() => false);
  }
}
