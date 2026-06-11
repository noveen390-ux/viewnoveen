import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { prisma } from '@viewnoveen/database';
import { createRoomSchema, updateRoomSchema } from '@viewnoveen/shared';
import * as crypto from 'crypto';
import { Redis } from 'ioredis';
import { InjectRedis } from '../redis/redis.decorator';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  async createRoom(userId: string, data: any) {
    const validated = createRoomSchema.parse(data);

    const code = await this.generateUniqueCode();

    const room = await prisma.room.create({
      data: {
        name: validated.name,
        description: validated.description || '',
        code,
        type: validated.type,
        privacy: validated.privacy,
        maxParticipants: validated.maxParticipants,
        tags: validated.tags || [],
        hostId: userId,
        channels: {
          create: [
            { name: 'general', type: 'text', position: 0 },
            { name: 'Voice Chat', type: 'voice', isVoice: true, bitrate: 64, position: 1 },
          ],
        },
        participants: {
          create: {
            userId,
            role: 'host',
          },
        },
      },
      include: {
        host: true,
        participants: {
          include: { user: true },
        },
        channels: true,
      },
    });

    await this.redis.hset(`room:${room.id}`, 'participants', 1);

    return room;
  }

  async getRoom(roomId: string, userId?: string) {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        host: true,
        video: true,
        participants: {
          include: { user: true },
          orderBy: { joinedAt: 'asc' },
        },
        channels: {
          orderBy: { position: 'asc' },
        },
        _count: {
          select: { participants: true },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.privacy === 'private' && userId) {
      const isParticipant = room.participants.some((p) => p.userId === userId);
      if (!isParticipant && room.hostId !== userId) {
        throw new ForbiddenException('This is a private room');
      }
    }

    return room;
  }

  async getRoomByCode(code: string) {
    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        host: { select: { id: true, username: true, displayName: true, avatar: true } },
        _count: { select: { participants: true } },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  async updateRoom(roomId: string, userId: string, data: any) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.hostId !== userId) throw new ForbiddenException('Only the host can update the room');

    const validated = updateRoomSchema.parse(data);

    return prisma.room.update({
      where: { id: roomId },
      data: validated,
      include: {
        host: true,
        participants: { include: { user: true } },
      },
    });
  }

  async deleteRoom(roomId: string, userId: string) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.hostId !== userId) throw new ForbiddenException('Only the host can delete the room');

    await prisma.room.delete({ where: { id: roomId } });
    await this.redis.del(`room:${roomId}`);

    return { message: 'Room deleted' };
  }

  async joinRoom(roomId: string, userId: string) {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { _count: { select: { participants: true } } },
    });

    if (!room) throw new NotFoundException('Room not found');
    if (!room.isActive) throw new BadRequestException('Room is no longer active');

    if (room._count.participants >= room.maxParticipants) {
      throw new BadRequestException('Room is full');
    }

    const existingParticipant = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (existingParticipant) {
      return this.getRoom(roomId, userId);
    }

    await prisma.roomParticipant.create({
      data: { roomId, userId },
    });

    await this.redis.hincrby(`room:${roomId}`, 'participants', 1);

    return this.getRoom(roomId, userId);
  }

  async leaveRoom(roomId: string, userId: string) {
    const participant = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (!participant) throw new NotFoundException('Not a participant');

    const room = await prisma.room.findUnique({ where: { id: roomId } });

    if (room?.hostId === userId) {
      const nextHost = await prisma.roomParticipant.findFirst({
        where: { roomId, userId: { not: userId } },
        orderBy: { joinedAt: 'asc' },
      });

      if (nextHost) {
        await prisma.roomParticipant.update({
          where: { id: nextHost.id },
          data: { role: 'host' },
        });
        await prisma.room.update({
          where: { id: roomId },
          data: { hostId: nextHost.userId },
        });
      } else {
        await prisma.room.update({
          where: { id: roomId },
          data: { isActive: false },
        });
      }
    }

    await prisma.roomParticipant.delete({
      where: { roomId_userId: { roomId, userId } },
    });

    await prisma.voiceState.deleteMany({
      where: { roomId, userId },
    });

    await this.redis.hincrby(`room:${roomId}`, 'participants', -1);

    return { message: 'Left room' };
  }

  async searchRooms(query: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [rooms, total] = await Promise.all([
      prisma.room.findMany({
        where: {
          isActive: true,
          privacy: 'public',
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { tags: { has: query } },
          ],
        },
        include: {
          host: { select: { id: true, username: true, displayName: true, avatar: true } },
          _count: { select: { participants: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.room.count({
        where: {
          isActive: true,
          privacy: 'public',
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return { data: rooms, total, page, limit, hasMore: skip + rooms.length < total };
  }

  async setVideo(roomId: string, userId: string, videoData: any) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');

    const participant = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!participant || (participant.role === 'participant' && room.hostId !== userId)) {
      throw new ForbiddenException('Only hosts and co-hosts can change the video');
    }

    const video = await prisma.roomVideo.upsert({
      where: { roomId },
      update: {
        title: videoData.title,
        url: videoData.url,
        thumbnail: videoData.thumbnail || '',
        duration: videoData.duration || 0,
        source: videoData.source || 'youtube',
        sourceId: videoData.sourceId || '',
        addedById: userId,
      },
      create: {
        roomId,
        title: videoData.title,
        url: videoData.url,
        thumbnail: videoData.thumbnail || '',
        duration: videoData.duration || 0,
        source: videoData.source || 'youtube',
        sourceId: videoData.sourceId || '',
        addedById: userId,
      },
    });

    await this.redis.publish(
      `room:${roomId}:sync`,
      JSON.stringify({ type: 'video_change', videoId: video.id, userId }),
    );

    return video;
  }

  async getParticipants(roomId: string) {
    return prisma.roomParticipant.findMany({
      where: { roomId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async updateParticipantRole(roomId: string, userId: string, targetUserId: string, role: any) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.hostId !== userId) throw new ForbiddenException('Only the host can change roles');

    return prisma.roomParticipant.update({
      where: { roomId_userId: { roomId, userId: targetUserId } },
      data: { role },
      include: { user: true },
    });
  }

  private async generateUniqueCode(): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string;
    let exists = true;

    while (exists) {
      code = Array.from({ length: 8 }, () => chars[crypto.randomInt(chars.length)]).join('');
      exists = !!(await prisma.room.findUnique({ where: { code } }));
    }

    return code!;
  }
}
