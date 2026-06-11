import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { prisma } from '@viewnoveen/database';

@ApiTags('Health')
@Controller()
export class HealthController {
  @Get('api/health')
  async health() {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: 'connected',
        version: '1.0.0',
      };
    } catch {
      return {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
      };
    }
  }
}
