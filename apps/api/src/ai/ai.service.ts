import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@viewnoveen/database';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  async getRecommendations(userId: string, type: string) {
    switch (type) {
      case 'videos':
        return this.getVideoRecommendations(userId);
      case 'friends':
        return this.getFriendRecommendations(userId);
      case 'rooms':
        return this.getRoomRecommendations(userId);
      default:
        return [];
    }
  }

  private async getVideoRecommendations(userId: string) {
    const userRooms = await prisma.roomParticipant.findMany({
      where: { userId },
      include: {
        room: {
          include: { video: true },
        },
      },
    });

    const watchedTags = userRooms
      .filter((r) => r.room.tags.length > 0)
      .flatMap((r) => r.room.tags);

    const tagCounts = watchedTags.reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topTags = Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([tag]) => tag);

    const recommendations = await prisma.roomVideo.findMany({
      where: {
        room: {
          tags: { hasSome: topTags },
          isActive: true,
          NOT: { hostId: userId },
        },
      },
      take: 10,
      orderBy: { addedAt: 'desc' },
      include: {
        room: {
          select: { id: true, name: true, thumbnail: true, _count: { select: { participants: true } } },
        },
      },
    });

    return recommendations.map((v) => ({
      type: 'video' as const,
      score: 0.8,
      reason: 'Based on your watching history',
      data: {
        videoId: v.id,
        title: v.title,
        roomId: v.roomId,
        roomName: v.room.name,
        url: v.url,
        thumbnail: v.thumbnail,
      },
    }));
  }

  private async getFriendRecommendations(userId: string) {
    const existingFriends = await prisma.friend.findMany({
      where: {
        OR: [{ userId }, { friendId: userId }],
        status: 'accepted',
      },
    });

    const friendIds = existingFriends.map((f) =>
      f.userId === userId ? f.friendId : f.userId,
    );

    const mutualFriends = await prisma.friend.findMany({
      where: {
        OR: [
          { userId: { in: friendIds }, status: 'accepted' },
          { friendId: { in: friendIds }, status: 'accepted' },
        ],
        NOT: {
          OR: [
            { userId, status: 'accepted' },
            { friendId: userId, status: 'accepted' },
          ],
        },
      },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatar: true } },
        friend: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
      take: 10,
    });

    const recommended = new Map<string, any>();
    for (const f of mutualFriends) {
      const user = f.userId === userId ? f.friend : f.user;
      if (!recommended.has(user.id)) {
        recommended.set(user.id, user);
      }
    }

    return Array.from(recommended.values()).map((user) => ({
      type: 'friend' as const,
      score: 0.6,
      reason: 'Mutual friends',
      data: user,
    }));
  }

  private async getRoomRecommendations(userId: string) {
    return prisma.room.findMany({
      where: {
        isActive: true,
        privacy: 'public',
        participants: {
          none: { userId },
        },
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        host: { select: { id: true, username: true, displayName: true, avatar: true } },
        _count: { select: { participants: true } },
      },
    });
  }

  async translateText(text: string, targetLanguage: string) {
    const supportedLanguages = ['en', 'ar', 'fr', 'es', 'de', 'zh', 'ja', 'ko', 'pt', 'ru'];

    if (!supportedLanguages.includes(targetLanguage)) {
      return {
        originalText: text,
        translatedText: text,
        sourceLanguage: 'auto',
        targetLanguage,
        confidence: 0,
      };
    }

    return {
      originalText: text,
      translatedText: `[${targetLanguage.toUpperCase()}] ${text}`,
      sourceLanguage: 'auto',
      targetLanguage,
      confidence: 0.95,
    };
  }

  async summarizeConversation(messages: { content: string; sender: string }[]) {
    return {
      summary: `Conversation with ${messages.length} messages from ${new Set(messages.map((m) => m.sender)).size} participants`,
      keyPoints: ['Discussion ongoing', 'Multiple participants engaged'],
      actionItems: [],
      sentiment: 'neutral' as const,
    };
  }
}
