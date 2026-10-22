import { Global, Module } from '@nestjs/common';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

/** Briques sans dépendance métier (sessions, hachage), partagées par auth, users et les gardes globaux. */
@Global()
@Module({
  providers: [SessionService, PasswordService],
  exports: [SessionService, PasswordService],
})
export class AuthCoreModule {}
