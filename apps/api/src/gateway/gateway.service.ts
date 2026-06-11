import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  async broadcastToRoom(roomId: string, event: string, data: any) {}
  async sendToUser(userId: string, event: string, data: any) {}
}
