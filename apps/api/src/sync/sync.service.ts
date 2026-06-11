import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis/redis.service';
import { prisma } from '@viewnoveen/database';

interface SyncParticipant {
  id: string;
  socketId: string;
  joinedAt: number;
  lastSync?: number;
  drift?: number;
}

interface RoomSyncState {
  roomId: string;
  videoId?: string;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  lastUpdated: number;
  hostId?: string;
}

interface SyncAction {
  type: string;
  roomId: string;
  userId: string;
  data: {
    currentTime?: number;
    playbackRate?: number;
    volume?: number;
    videoId?: string;
    timestamp?: number;
  };
  timestamp: number;
  sequenceId: number;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly rooms = new Map<string, Map<string, SyncParticipant>>();
  private readonly roomStates = new Map<string, RoomSyncState>();
  private readonly MAX_DRIFT_MS = 100;
  private readonly SYNC_INTERVAL = 50;

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async validateToken(token: string): Promise<{ id: string; username: string } | null> {
    try {
      const payload = this.jwtService.verify(token);
      return { id: payload.sub, username: payload.email };
    } catch {
      return null;
    }
  }

  addParticipant(roomId: string, participant: SyncParticipant) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Map());
    }
    this.rooms.get(roomId)!.set(participant.id, participant);
  }

  removeParticipant(roomId: string, userId: string) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(userId);
      if (room.size === 0) {
        this.rooms.delete(roomId);
      }
    }
  }

  getParticipants(roomId: string): SyncParticipant[] {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.values()) : [];
  }

  getParticipantCount(roomId: string): number {
    return this.rooms.get(roomId)?.size || 0;
  }

  async getRoomState(roomId: string): Promise<RoomSyncState | null> {
    let state = this.roomStates.get(roomId);

    if (!state) {
      const dbState = await prisma.roomVideo.findUnique({
        where: { roomId },
      });

      if (dbState) {
        state = {
          roomId,
          videoId: dbState.id,
          currentTime: dbState.currentTime,
          isPlaying: dbState.isPlaying,
          playbackRate: dbState.playbackRate,
          volume: dbState.volume,
          lastUpdated: dbState.addedAt.getTime(),
        };
        this.roomStates.set(roomId, state);
      }
    }

    return state || null;
  }

  async processAction(roomId: string, action: SyncAction) {
    const state = this.roomStates.get(roomId) || {
      roomId,
      currentTime: 0,
      isPlaying: false,
      playbackRate: 1,
      volume: 1,
      lastUpdated: Date.now(),
    };

    switch (action.type) {
      case 'play':
        state.isPlaying = true;
        state.currentTime = action.data.currentTime ?? state.currentTime;
        break;
      case 'pause':
        state.isPlaying = false;
        state.currentTime = action.data.currentTime ?? state.currentTime;
        break;
      case 'seek':
        state.currentTime = action.data.currentTime ?? 0;
        break;
      case 'rate_change':
        state.playbackRate = action.data.playbackRate ?? 1;
        break;
      case 'volume_change':
        state.volume = action.data.volume ?? 1;
        break;
      case 'video_change':
        state.videoId = action.data.videoId;
        state.currentTime = 0;
        state.isPlaying = false;
        break;
    }

    state.lastUpdated = Date.now();
    this.roomStates.set(roomId, state);

    await this.redisService.set(
      `sync:room:${roomId}`,
      JSON.stringify(state),
      3600,
    );
  }

  calculateDrift(roomId: string, participantId: string): number {
    const room = this.rooms.get(roomId);
    if (!room) return 0;

    const participant = room.get(participantId);
    if (!participant) return 0;

    const host = Array.from(room.values()).find((p) => p.id === roomId);
    if (!host || host.id === participantId) return 0;

    return (participant.lastSync || 0) - (host.lastSync || 0);
  }

  needsResync(roomId: string, participantId: string): boolean {
    return Math.abs(this.calculateDrift(roomId, participantId)) > this.MAX_DRIFT_MS;
  }

  async broadcastSyncState(roomId: string, server: any) {
    const state = this.roomStates.get(roomId);
    if (!state) return;

    const adjustedState = {
      ...state,
      currentTime: state.isPlaying
        ? state.currentTime + (Date.now() - state.lastUpdated) * state.playbackRate / 1000
        : state.currentTime,
      serverTimestamp: Date.now(),
    };

    server.to(`room:${roomId}`).emit('sync:state', adjustedState);
  }

  getMetrics(roomId: string): {
    participantCount: number;
    averageLatency: number;
    driftCorrections: number;
  } {
    const participants = this.getParticipants(roomId);
    const latencies = participants
      .map((p) => p.drift || 0)
      .filter((d) => d !== undefined);

    return {
      participantCount: participants.length,
      averageLatency: latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0,
      driftCorrections: participants.filter((p) => Math.abs(p.drift || 0) > this.MAX_DRIFT_MS).length,
    };
  }
}
