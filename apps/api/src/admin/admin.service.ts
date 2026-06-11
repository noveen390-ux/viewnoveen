import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@viewnoveen/database';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly configService: ConfigService) {}

  private async verifyAdmin(userId: string) {
    const admin = await prisma.admin.findUnique({
      where: { userId },
    });
    if (!admin) throw new UnauthorizedException('Admin access required');
    return admin;
  }

  async getDashboard(userId: string) {
    await this.verifyAdmin(userId);

    const [
      totalUsers, activeUsers, totalRooms, activeRooms,
      totalMessages, totalUploads, totalReports,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isOnline: true } }),
      prisma.room.count(),
      prisma.room.count({ where: { isActive: true } }),
      prisma.message.count(),
      prisma.upload.count(),
      prisma.report.count({ where: { status: 'pending' } }),
    ]);

    return {
      totalUsers,
      activeUsers,
      totalRooms,
      activeRooms,
      totalMessages,
      totalUploads,
      totalReports,
      timestamp: new Date().toISOString(),
    };
  }

  async getUsers(userId: string, page = 1, limit = 20, search?: string) {
    await this.verifyAdmin(userId);
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { username: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { displayName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, username: true, displayName: true, email: true,
          isVerified: true, isOnline: true, status: true, createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return { data: users, total, page, limit, hasMore: skip + users.length < total };
  }

  async getReports(userId: string, page = 1, limit = 20) {
    await this.verifyAdmin(userId);
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.report.count(),
    ]);

    return { data: reports, total, page, limit, hasMore: skip + reports.length < total };
  }

  async resolveReport(userId: string, reportId: string, action: string) {
    await this.verifyAdmin(userId);

    return prisma.report.update({
      where: { id: reportId },
      data: {
        status: action === 'dismiss' ? 'dismissed' : 'resolved',
        resolvedBy: userId,
        resolvedAt: new Date(),
      },
    });
  }

  async toggleUserVerification(userId: string, targetUserId: string) {
    await this.verifyAdmin(userId);

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new UnauthorizedException('User not found');

    return prisma.user.update({
      where: { id: targetUserId },
      data: { isVerified: !target.isVerified },
    });
  }

  async suspendUser(userId: string, targetUserId: string) {
    await this.verifyAdmin(userId);

    return prisma.user.update({
      where: { id: targetUserId },
      data: { status: 'invisible', isOnline: false },
    });
  }

  async getSystemLogs(userId: string, page = 1, limit = 50) {
    await this.verifyAdmin(userId);
    return { data: [], total: 0, page, limit, hasMore: false };
  }

  async getAnalytics(userId: string) {
    await this.verifyAdmin(userId);

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      newUsers24h, newRooms24h, newMessages24h,
    ] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: last24h } } }),
      prisma.room.count({ where: { createdAt: { gte: last24h } } }),
      prisma.message.count({ where: { createdAt: { gte: last24h } } }),
    ]);

    return {
      newUsers24h,
      newRooms24h,
      newMessages24h,
      timestamp: now.toISOString(),
    };
  }
}
