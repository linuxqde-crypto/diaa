import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentService } from './payment.service';
import { BtcpayProvider } from '../../payment-providers/btcpay.provider';
import { PAYMENT_PROVIDER } from '../../payment-providers/payment-provider.interface';

/**
 * Exposes the PaymentService singleton AND the provider binding to every module
 * (OrdersController auto-invoice, WebhooksModule processing) so there is exactly
 * ONE instance of each across the app. Provider chosen via PAYMENT_PROVIDER env
 * ("btcpay" default; NOWPayments drops in later behind the same interface).
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    BtcpayProvider,
    { provide: PAYMENT_PROVIDER, useExisting: BtcpayProvider },
    PaymentService,
  ],
  exports: [PaymentService, PAYMENT_PROVIDER, BtcpayProvider],
})
export class PaymentsSharedModule {}
