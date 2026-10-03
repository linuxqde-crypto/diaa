import { Global, Module } from '@nestjs/common';
import { PaymentService } from './payment.service';

/** Exposes the PaymentService singleton to OrdersController (reveal) and WebhooksModule. */
@Global()
@Module({ providers: [PaymentService], exports: [PaymentService] })
export class PaymentsSharedModule {}
