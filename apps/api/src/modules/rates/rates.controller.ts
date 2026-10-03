import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RatesService } from './rates.service';

@ApiTags('rates')
@Controller('rates')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class RatesController {
  constructor(private readonly rates: RatesService) {}

  @Get('crypto')
  @ApiOperation({ summary: 'أسعار العملات الرقمية اللحظية مقابل USD (كاش Redis 60 ثانية)' })
  quotes() {
    return this.rates.quotes();
  }
}
