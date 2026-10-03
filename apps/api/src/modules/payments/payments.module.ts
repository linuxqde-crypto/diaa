import { Module } from '@nestjs/common';
import { BtcpayProvider } from '../../payment-providers/btcpay.provider';
import { PAYMENT_PROVIDER } from '../../payment-providers/payment-provider.interface';
import { PaymentsController } from './payments.controller';
import { SettingsService } from '../../common/settings.service';
import { AuditService } from '../../common/audit.service';

/**
 * Provider selection via PAYMENT_PROVIDER env ("btcpay" default | "nowpayments" later).
 * PaymentService itself lives in PaymentsSharedModule (global) so webhooks/orders reuse ONE instance.
 */
@Module({
  controllers: [PaymentsController],
  providers: [BtcpayProvider, { provide: PAYMENT_PROVIDER, useExisting: BtcpayProvider }, SettingsService, AuditService],
  exports: [PAYMENT_PROVIDER, BtcpayProvider],
})
export class PaymentsModule {}
