import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { CartModule } from '../cart/cart.module';

@Module({
  // PaymentService comes from the global PaymentsSharedModule (wired in AppModule).
  imports: [CartModule],
  controllers: [OrdersController],
})
export class OrdersModule {}
