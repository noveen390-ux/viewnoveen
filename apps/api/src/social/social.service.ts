import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { prisma } from '@viewnoveen/database';

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  async sendFriendRequest(userId: string, targetUserId: string) {
    if (userId === targetUserId) throw new ConflictException('Cannot add yourself');

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('User not found');

    const existing = await prisma.friend.findUnique({
      where: { userId_friendId: { userId, friendId: targetUserId } },
    });

    if (existing) {
      if (existing.status === 'accepted') throw new ConflictException('Already friends');
      if (existing.status === 'blocked') throw new ConflictException('Cannot send request');
      return existing;
    }

    return prisma.friend.create({
      data: { userId, friendId: targetUserId, status: 'pending' },
      include: { friend: { select: { id: true, username: true, displayName: true, avatar: true } } },
    });
  }

  async acceptFriendRequest(userId: string, requesterId: string) {
    const request = await prisma.friend.findUnique({
      where: { userId_friendId: { userId: requesterId, friendId: userId } },
    });

    if (!request || request.status !== 'pending') {
      throw new NotFoundException('Friend request not found');
    }

    return prisma.friend.update({
      where: { id: request.id },
      data: { status: 'accepted' },
      include: { user: { select: { id: true, username: true, displayName: true, avatar: true } } },
    });
  }

  async rejectFriendRequest(userId: string, requesterId: string) {
    const request = await prisma.friend.findUnique({
      where: { userId_friendId: { userId: requesterId, friendId: userId } },
    });

    if (!request) throw new NotFoundException('Friend request not found');

    return prisma.friend.delete({ where: { id: request.id } });
  }

  async removeFriend(userId: string, friendId: string) {
    const friendship = await prisma.friend.findFirst({
      where: {
        OR: [
          { userId, friendId, status: 'accepted' },
          { userId: friendId, friendId: userId, status: 'accepted' },
        ],
      },
    });

    if (!friendship) throw new NotFoundException('Friendship not found');

    return prisma.friend.delete({ where: { id: friendship.id } });
  }

  async getFriends(userId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [friends, total] = await Promise.all([
      prisma.friend.findMany({
        where: {
          OR: [
            { userId, status: 'accepted' },
            { friendId: userId, status: 'accepted' },
          ],
        },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatar: true, status: true, isOnline: true } },
          friend: { select: { id: true, username: true, displayName: true, avatar: true, status: true, isOnline: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.friend.count({
        where: {
          OR: [
            { userId, status: 'accepted' },
            { friendId: userId, status: 'accepted' },
          ],
        },
      }),
    ]);

    const mappedFriends = friends.map((f) => {
      const friendUser = f.userId === userId ? f.friend : f.user;
      return { id: f.id, friend: friendUser, status: f.status, createdAt: f.createdAt };
    });

    return { data: mappedFriends, total, page, limit, hasMore: skip + mappedFriends.length < total };
  }

  async getPendingRequests(userId: string) {
    return prisma.friend.findMany({
      where: { friendId: userId, status: 'pending' },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async followUser(userId: string, targetUserId: string) {
    if (userId === targetUserId) throw new ConflictException('Cannot follow yourself');

    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: targetUserId } },
    });

    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
      return { following: false };
    }

    await prisma.follow.create({
      data: { followerId: userId, followingId: targetUserId },
    });

    return { following: true };
  }

  async getFollowers(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [followers, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followingId: userId },
        include: {
          follower: { select: { id: true, username: true, displayName: true, avatar: true, isOnline: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.follow.count({ where: { followingId: userId } }),
    ]);

    return {
      data: followers.map((f) => f.follower),
      total,
      page,
      limit,
      hasMore: skip + followers.length < total,
    };
  }

  async getFollowing(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [following, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: userId },
        include: {
          following: { select: { id: true, username: true, displayName: true, avatar: true, isOnline: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.follow.count({ where: { followerId: userId } }),
    ]);

    return {
      data: following.map((f) => f.following),
      total,
      page,
      limit,
      hasMore: skip + following.length < total,
    };
  }

  async createCommunity(userId: string, data: { name: string; description?: string; type?: string }) {
    const community = await prisma.community.create({
      data: {
        name: data.name,
        description: data.description || '',
        type: data.type || 'public',
        ownerId: userId,
        members: { create: { userId, role: 'owner' } },
      },
      include: { members: { include: { user: { select: { id: true, username: true, avatar: true } } } } },
    });

    return community;
  }

  async getCommunities(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [communities, total] = await Promise.all([
      prisma.community.findMany({
        where: { type: 'public' },
        include: {
          _count: { select: { members: true } },
          owner: { select: { id: true, username: true, avatar: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.community.count({ where: { type: 'public' } }),
    ]);

    return { data: communities, total, page, limit, hasMore: skip + communities.length < total };
  }
}
