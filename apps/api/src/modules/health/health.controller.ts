import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness + database connectivity probe' })
  @ApiOkResponse({ description: '{ ok: true } when Postgres is reachable' })
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, service: 'kroto-api', ts: Date.now() };
  }
}
