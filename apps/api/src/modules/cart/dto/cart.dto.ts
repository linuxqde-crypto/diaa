import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CartItem } from '../cart.util';

export class CartItemDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;
}

/**
 * Canonical cart payload. `normalizeCart(items)` is applied server-side after this DTO passes,
 * merging duplicate product rows and capping totals — mirrored 1:1 in the storefront lib/cart.ts.
 */
export class CartDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItem[];
}
