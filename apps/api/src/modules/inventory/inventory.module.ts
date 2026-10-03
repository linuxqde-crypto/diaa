import { Global, Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Global()
@Module({ providers: [InventoryService], exports: [InventoryService] })
export class InventoryModule {}
