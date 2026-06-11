import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { SyncService } from './sync.service';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { RedisService } from '../redis/redis.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  currentRoom?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/sync',
  transports: ['websocket', 'polling'],
})
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SyncGateway.name);
  private readonly syncInterval = 50; // 50ms sync interval

  constructor(
    private readonly syncService: SyncService,
    private readonly redisService: RedisService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      if (!token) {
        client.disconnect();
        return;
      }

      const user = await this.syncService.validateToken(token as string);
      if (!user) {
        client.disconnect();
        return;
      }

      client.userId = user.id;
      client.username = user.username;

      await this.redisService.set(`online:${user.id}`, 'true', 300);
      await this.redisService.publish('presence', JSON.stringify({
        userId: user.id,
        status: 'online',
        timestamp: Date.now(),
      }));

      client.join(`user:${user.id}`);
      this.logger.log(`User ${user.username} (${user.id}) connected`);
    } catch (error) {
      this.logger.error(`Connection failed: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      if (client.currentRoom) {
        await this.handleLeaveRoom(client, client.currentRoom);
      }

      await this.redisService.del(`online:${client.userId}`);
      await this.redisService.publish('presence', JSON.stringify({
        userId: client.userId,
        status: 'offline',
        timestamp: Date.now(),
      }));

      this.logger.log(`User ${client.username} disconnected`);
    }
  }

  @SubscribeMessage('join:room')
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    if (!client.userId) throw new WsException('Unauthorized');

    const roomId = data.roomId;
    client.join(`room:${roomId}`);
    client.currentRoom = roomId;

    this.syncService.addParticipant(roomId, {
      id: client.userId,
      socketId: client.id,
      joinedAt: Date.now(),
    });

    const participants = this.syncService.getParticipants(roomId);
    this.server.to(`room:${roomId}`).emit('room:participants', participants);

    const roomState = await this.syncService.getRoomState(roomId);
    if (roomState) {
      client.emit('sync:state', roomState);
    }

    this.logger.log(`User ${client.username} joined room ${roomId}`);
  }

  @SubscribeMessage('leave:room')
  async handleLeaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() roomId?: string,
  ) {
    const targetRoom = roomId || client.currentRoom;
    if (!targetRoom || !client.userId) return;

    client.leave(`room:${targetRoom}`);
    client.currentRoom = undefined;

    this.syncService.removeParticipant(targetRoom, client.userId);

    const participants = this.syncService.getParticipants(targetRoom);
    this.server.to(`room:${targetRoom}`).emit('room:participants', participants);

    this.logger.log(`User ${client.username} left room ${targetRoom}`);
  }

  @SubscribeMessage('sync:action')
  async handleSyncAction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: {
      type: string;
      roomId: string;
      data: {
        currentTime?: number;
        playbackRate?: number;
        volume?: number;
        videoId?: string;
        timestamp?: number;
      };
    },
  ) {
    if (!client.userId || !client.currentRoom) throw new WsException('Not in a room');

    const action = {
      type: data.type,
      roomId: data.roomId,
      userId: client.userId,
      data: {
        ...data.data,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
      sequenceId: Date.now(),
    };

    await this.syncService.processAction(data.roomId, action);

    client.to(`room:${data.roomId}`).emit('sync:action', action);
  }

  @SubscribeMessage('sync:request')
  async handleSyncRequest(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    if (!client.userId) return;

    const roomState = await this.syncService.getRoomState(data.roomId);
    if (roomState) {
      client.emit('sync:state', roomState);
    }
  }

  @SubscribeMessage('ping')
  async handlePing(@ConnectedSocket() client: AuthenticatedSocket) {
    client.emit('pong', { timestamp: Date.now() });
  }

  @SubscribeMessage('latency:measure')
  async handleLatencyMeasure(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { clientTimestamp: number },
  ) {
    client.emit('latency:result', {
      clientTimestamp: data.clientTimestamp,
      serverTimestamp: Date.now(),
    });
  }
}
