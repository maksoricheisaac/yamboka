import { Global, Module } from '@nestjs/common';
import { LegalService } from './legal.service';

@Global()
@Module({ providers: [LegalService], exports: [LegalService] })
export class LegalModule {}
