import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { PricingModule } from '../pricing/pricing.module';
import { GenerationProvider } from './generation-provider';
import { HiggsfieldGenerationProvider } from './higgsfield-generation.provider';
import { MockGenerationProvider } from './mock-generation.provider';
import { ModelCatalogService } from './model-catalog.service';

/** Choisit le fournisseur d'après GENERATION_PROVIDER (mock ou higgsfield). Partagé par le script de test. */
export function createGenerationProvider(
  config: ConfigService<Env, true>,
): GenerationProvider {
  return config.get('GENERATION_PROVIDER', { infer: true }) === 'higgsfield'
    ? new HiggsfieldGenerationProvider(config)
    : new MockGenerationProvider(
        config.get('MOCK_GENERATION_SECONDS', { infer: true }),
      );
}

@Global()
@Module({
  imports: [PricingModule],
  providers: [
    ModelCatalogService,
    {
      provide: GenerationProvider,
      inject: [ConfigService],
      useFactory: createGenerationProvider,
    },
  ],
  exports: [GenerationProvider, ModelCatalogService],
})
export class GenerationModule {}
