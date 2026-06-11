import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@viewnoveen/database';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async createNotification(data: {
    userId: string;
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }) {
    return prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type as any,
        title: data.title,
        body: data.body,
        data: data.data || {},
      },
    });
  }

  async getNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      data: notifications,
      total,
      unreadCount,
      page,
      limit,
      hasMore: skip + notifications.length < total,
    };
  }

  async markAsRead(notificationId: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async deleteNotification(notificationId: string, userId: string) {
    return prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });
  }

  async notifyAll(data: { type: string; title: string; body: string }) {
    const users = await prisma.user.findMany({
      select: { id: true },
      where: { isOnline: true },
    });

    await prisma.notification.createMany({
      data: users.map((user) => ({
        userId: user.id,
        type: data.type as any,
        title: data.title,
        body: data.body,
      })),
    });

    return { sent: users.length };
  }
}
