import { Global, Module } from '@nestjs/common';
import { ConsoleEmailProvider } from './console-email.provider';
import { EmailProvider } from './email.provider';
import { EmailService } from './email.service';

@Global()
@Module({
  providers: [
    ConsoleEmailProvider,
    { provide: EmailProvider, useExisting: ConsoleEmailProvider },
    EmailService,
  ],
  exports: [EmailService, EmailProvider, ConsoleEmailProvider],
})
export class EmailModule {}
