import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CryptoCurrency, Network } from '@prisma/client';
import { CartDto } from '../../cart/dto/cart.dto';

export class GuestCheckoutItemDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;
}

/**
 * Guest checkout payload (PHASE 2). Payment selection (coin/network) arrives in PHASE 3
 * as an extension of this DTO; the order stays PENDING until an invoice is created.
 */
export class CreateGuestOrderDto {
  @IsEmail({}, { message: 'بريد إلكتروني غير صالح — مطلوب لتسليم الأكواد' })
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullNameAr?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => GuestCheckoutItemDto)
  items!: CartDto['items'];

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,32}$/i, { message: 'رمز خصم غير صالح' })
  couponCode?: string;

  /** PHASE 3: coin/network chosen at checkout → the order auto-creates its invoice (rate locked 15 min). */
  @IsOptional()
  @IsEnum(CryptoCurrency)
  currency?: CryptoCurrency;

  @IsOptional()
  @IsEnum(Network)
  network?: Network;
}
