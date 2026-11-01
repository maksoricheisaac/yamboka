import { Global, Module } from '@nestjs/common';
import { NotificationsController, PreferencesController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [NotificationsController, PreferencesController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
