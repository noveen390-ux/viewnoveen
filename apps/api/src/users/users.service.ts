import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { prisma } from '@viewnoveen/database';
import { updateProfileSchema } from '@viewnoveen/shared';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            followers: true,
            following: true,
            friends: { where: { status: 'accepted' } },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getPublicProfile(username: string) {
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        banner: true,
        bio: true,
        status: true,
        isVerified: true,
        isOnline: true,
        lastSeen: true,
        createdAt: true,
        _count: {
          select: {
            followers: true,
            following: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, data: any) {
    const validated = updateProfileSchema.parse(data);
    return prisma.user.update({
      where: { id: userId },
      data: validated,
    });
  }

  async searchUsers(query: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { displayName: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          bio: true,
          status: true,
          isVerified: true,
          isOnline: true,
        },
        skip,
        take: limit,
      }),
      prisma.user.count({
        where: {
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { displayName: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return { data: users, total, page, limit, hasMore: skip + users.length < total };
  }

  async getUserRooms(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [rooms, total] = await Promise.all([
      prisma.room.findMany({
        where: {
          participants: { some: { userId } },
          isActive: true,
        },
        include: {
          host: { select: { id: true, username: true, displayName: true, avatar: true } },
          _count: { select: { participants: true } },
        },
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.room.count({
        where: {
          participants: { some: { userId } },
          isActive: true,
        },
      }),
    ]);

    return { data: rooms, total, page, limit, hasMore: skip + rooms.length < total };
  }

  async setStatus(userId: string, status: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { status: status as any, isOnline: status !== 'invisible', lastSeen: new Date() },
    });
  }
}
