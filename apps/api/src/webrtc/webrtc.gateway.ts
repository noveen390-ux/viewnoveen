import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { WebRTCService } from './webrtc.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/webrtc',
  transports: ['websocket'],
})
export class WebRTCGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebRTCGateway.name);

  constructor(private readonly webrtcService: WebRTCService) {}

  @SubscribeMessage('call:offer')
  async handleOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetUserId: string; roomId: string; sdp: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    this.logger.log(`Call offer from ${userId} to ${data.targetUserId}`);

    const offer = {
      type: 'offer' as const,
      sdp: data.sdp,
      userId,
      targetUserId: data.targetUserId,
      roomId: data.roomId,
    };

    await this.webrtcService.storePendingOffer(offer);
    client.to(`user:${data.targetUserId}`).emit('call:incoming', {
      from: userId,
      roomId: data.roomId,
      sdp: data.sdp,
    });
  }

  @SubscribeMessage('call:answer')
  async handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetUserId: string; roomId: string; sdp: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    this.logger.log(`Call answer from ${userId} to ${data.targetUserId}`);

    client.to(`user:${data.targetUserId}`).emit('call:answered', {
      from: userId,
      roomId: data.roomId,
      sdp: data.sdp,
    });
  }

  @SubscribeMessage('ice:candidate')
  async handleICECandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      targetUserId: string;
      candidate: string;
      sdpMid: string;
      sdpMLineIndex: number;
    },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    client.to(`user:${data.targetUserId}`).emit('ice:candidate', {
      from: userId,
      candidate: data.candidate,
      sdpMid: data.sdpMid,
      sdpMLineIndex: data.sdpMLineIndex,
    });
  }

  @SubscribeMessage('call:end')
  async handleCallEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetUserId: string; roomId: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    client.to(`user:${data.targetUserId}`).emit('call:ended', {
      from: userId,
      roomId: data.roomId,
    });

    this.logger.log(`Call ended between ${userId} and ${data.targetUserId}`);
  }

  @SubscribeMessage('call:join_channel')
  async handleJoinVoiceChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; channelId: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    client.join(`voice:${data.channelId}`);
    client.to(`voice:${data.channelId}`).emit('voice:user_joined', { userId });
    this.logger.log(`User ${userId} joined voice channel ${data.channelId}`);
  }

  @SubscribeMessage('call:leave_channel')
  async handleLeaveVoiceChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    client.to(`voice:${data.channelId}`).emit('voice:user_left', { userId });
    client.leave(`voice:${data.channelId}`);
  }

  @SubscribeMessage('call:screen_share')
  async handleScreenShare(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; enabled: boolean; sdp?: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    client.to(`room:${data.roomId}`).emit('call:screen_share', {
      userId,
      enabled: data.enabled,
      sdp: data.sdp,
    });
  }

  @SubscribeMessage('call:mute')
  async handleMute(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; isMuted: boolean },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    client.to(`room:${data.roomId}`).emit('voice:mute', {
      userId,
      isMuted: data.isMuted,
    });
  }

  @SubscribeMessage('call:deafen')
  async handleDeafen(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; isDeafened: boolean },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    client.to(`room:${data.roomId}`).emit('voice:deafen', {
      userId,
      isDeafened: data.isDeafened,
    });
  }

  @SubscribeMessage('call:speaking')
  async handleSpeaking(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; isSpeaking: boolean },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    client.to(`room:${data.roomId}`).emit('voice:speaking', {
      userId,
      isSpeaking: data.isSpeaking,
    });
  }
}
