import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length } from 'class-validator';
import { CryptoCurrency, Network } from '@prisma/client';

const CURRENCIES = Object.values(CryptoCurrency);
const NETWORKS = Object.values(Network);

export class CreateInvoiceDto {
  @ApiProperty({ description: 'رقم الطلب KR-YYYY-XXXXXX' })
  @IsString()
  @Length(6, 40)
  orderNo!: string;

  @ApiProperty({ enum: CURRENCIES })
  @IsIn(CURRENCIES)
  currency!: CryptoCurrency;

  @ApiProperty({ enum: NETWORKS })
  @IsIn(NETWORKS)
  network!: Network;
}

export class InvoiceAccessDto {
  @ApiProperty({ description: 'رمز الوصول السري الذي أُعيد عند إنشاء الفاتورة' })
  @IsString()
  @Length(10, 128)
  token!: string;
}
