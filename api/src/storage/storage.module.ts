import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { LocalStorageDriver } from './local-storage.driver';
import { R2StorageDriver } from './r2-storage.driver';
import { StorageDriver } from './storage-driver';

/** Choisit le pilote de stockage d'après STORAGE_DRIVER (local ou r2). Partagé par le script de test. */
export function createStorageDriver(
  config: ConfigService<Env, true>,
): StorageDriver {
  return config.get('STORAGE_DRIVER', { infer: true }) === 'r2'
    ? new R2StorageDriver(config)
    : new LocalStorageDriver(config.get('LOCAL_STORAGE_DIR', { infer: true }));
}

@Global()
@Module({
  providers: [
    {
      provide: StorageDriver,
      inject: [ConfigService],
      useFactory: createStorageDriver,
    },
  ],
  exports: [StorageDriver],
})
export class StorageModule {}
