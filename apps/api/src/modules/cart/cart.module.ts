import { Module } from '@nestjs/common';
import { CartService } from './cart.service';

@Module({
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
