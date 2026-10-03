import { Type } from 'class-transformer';
import { IsArray, Matches, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { CartItemDto } from './cart.dto';
import { CartItem } from '../cart.util';

export class CheckCouponDto {
  @Matches(/^[A-Z0-9_-]{3,32}$/i, { message: 'رمز خصم غير صالح' })
  code!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItem[];
}
