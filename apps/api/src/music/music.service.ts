import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { prisma } from '@viewnoveen/database';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);

  constructor(private readonly redisService: RedisService) {}

  async createSession(userId: string, data: { roomId: string; name: string; mode?: string }) {
    const isHost = await prisma.room.findFirst({
      where: { id: data.roomId, hostId: userId },
    });
    if (!isHost) throw new ForbiddenException('Only room host can create music sessions');

    const existing = await prisma.musicSession.findUnique({
      where: { roomId: data.roomId },
    });
    if (existing) throw new ForbiddenException('Music session already exists');

    return prisma.musicSession.create({
      data: {
        roomId: data.roomId,
        name: data.name,
        djId: userId,
        mode: data.mode || 'collaborative',
      },
      include: { tracks: { orderBy: { position: 'asc' } } },
    });
  }

  async getSession(sessionId: string) {
    const session = await prisma.musicSession.findUnique({
      where: { id: sessionId },
      include: {
        tracks: { orderBy: { position: 'asc' } },
        room: { select: { id: true, name: true } },
      },
    });
    if (!session) throw new NotFoundException('Music session not found');
    return session;
  }

  async getSessionByRoom(roomId: string) {
    const session = await prisma.musicSession.findUnique({
      where: { roomId },
      include: {
        tracks: { orderBy: { position: 'asc' } },
      },
    });
    return session;
  }

  async addTrack(userId: string, data: {
    sessionId: string; title: string; artist: string;
    duration: number; url: string; album?: string; thumbnail?: string;
  }) {
    const session = await prisma.musicSession.findUnique({
      where: { id: data.sessionId },
    });
    if (!session) throw new NotFoundException('Session not found');

    if (session.mode === 'dj' && session.djId !== userId) {
      throw new ForbiddenException('Only the DJ can add tracks in DJ mode');
    }

    const maxPosition = await prisma.musicTrack.aggregate({
      where: { sessionId: data.sessionId },
      _max: { position: true },
    });

    return prisma.musicTrack.create({
      data: {
        sessionId: data.sessionId,
        title: data.title,
        artist: data.artist,
        album: data.album || '',
        duration: data.duration,
        url: data.url,
        thumbnail: data.thumbnail || '',
        addedById: userId,
        position: (maxPosition._max.position || 0) + 1,
      },
    });
  }

  async removeTrack(trackId: string, userId: string) {
    const track = await prisma.musicTrack.findUnique({
      where: { id: trackId },
      include: { session: true },
    });
    if (!track) throw new NotFoundException('Track not found');
    if (track.addedById !== userId && track.session.djId !== userId) {
      throw new ForbiddenException('Cannot remove this track');
    }

    return prisma.musicTrack.delete({ where: { id: trackId } });
  }

  async updatePlayback(sessionId: string, data: { isPlaying?: boolean; currentTime?: number }) {
    return prisma.musicSession.update({
      where: { id: sessionId },
      data: {
        ...(data.isPlaying !== undefined && { isPlaying: data.isPlaying }),
        ...(data.currentTime !== undefined && { currentTime: data.currentTime }),
      },
    });
  }

  async getQueue(sessionId: string) {
    return prisma.musicTrack.findMany({
      where: { sessionId },
      orderBy: { position: 'asc' },
      include: { addedBy: { select: { id: true, username: true, avatar: true } } },
    });
  }

  async reorderTracks(sessionId: string, trackIds: string[]) {
    const updates = trackIds.map((id, index) =>
      prisma.musicTrack.updateMany({
        where: { id, sessionId },
        data: { position: index },
      }),
    );
    await Promise.all(updates);
    return this.getQueue(sessionId);
  }
}
