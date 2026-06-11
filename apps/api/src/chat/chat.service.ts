import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { prisma } from '@viewnoveen/database';
import { sendMessageSchema } from '@viewnoveen/shared';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  async sendMessage(senderId: string, data: any) {
    const validated = sendMessageSchema.parse(data);

    const isParticipant = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId: validated.roomId, userId: senderId } },
    });

    if (!isParticipant) {
      throw new ForbiddenException('Not a participant in this room');
    }

    const message = await prisma.message.create({
      data: {
        roomId: validated.roomId,
        channelId: validated.channelId,
        senderId,
        content: validated.content,
        type: validated.type,
        replyTo: validated.replyTo || null,
      },
      include: {
        sender: {
          select: {
            id: true, username: true, displayName: true, avatar: true,
          },
        },
        attachments: true,
        reactions: {
          include: {
            user: { select: { id: true, username: true, avatar: true } },
          },
        },
      },
    });

    return message;
  }

  async getMessages(channelId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { channelId, isDeleted: false },
        include: {
          sender: {
            select: {
              id: true, username: true, displayName: true, avatar: true,
            },
          },
          attachments: true,
          reactions: {
            include: {
              user: { select: { id: true, username: true, avatar: true } },
            },
          },
          replyMessage: {
            select: {
              id: true, content: true, sender: {
                select: { id: true, username: true, displayName: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.message.count({
        where: { channelId, isDeleted: false },
      }),
    ]);

    return {
      data: messages.reverse(),
      total,
      page,
      limit,
      hasMore: skip + messages.length < total,
    };
  }

  async editMessage(messageId: string, userId: string, content: string) {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) throw new ForbiddenException('Cannot edit another user\'s message');
    if (message.isDeleted) throw new NotFoundException('Message is deleted');

    return prisma.message.update({
      where: { id: messageId },
      data: { content, isEdited: true },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatar: true } },
        attachments: true,
        reactions: {
          include: { user: { select: { id: true, username: true, avatar: true } } },
        },
      },
    });
  }

  async deleteMessage(messageId: string, userId: string) {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) throw new ForbiddenException('Cannot delete another user\'s message');

    return prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, content: '[deleted]' },
    });
  }

  async addReaction(messageId: string, userId: string, emoji: string) {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');

    const existing = await prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    });

    if (existing) {
      await prisma.messageReaction.delete({ where: { id: existing.id } });
      return { removed: true, emoji };
    }

    const reaction = await prisma.messageReaction.create({
      data: { messageId, userId, emoji },
      include: { user: { select: { id: true, username: true, avatar: true } } },
    });

    return reaction;
  }

  async getChannels(roomId: string) {
    return prisma.channel.findMany({
      where: { roomId },
      orderBy: { position: 'asc' },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { id: true, content: true, createdAt: true },
        },
      },
    });
  }

  async createChannel(data: any) {
    const channel = await prisma.channel.create({
      data: {
        roomId: data.roomId,
        name: data.name,
        type: data.type || 'text',
        topic: data.topic || '',
        isVoice: data.isVoice || false,
        bitrate: data.bitrate || 64,
        userLimit: data.userLimit || 0,
        position: data.position || 0,
      },
    });
    return channel;
  }

  async deleteChannel(channelId: string, userId: string) {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: { room: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.room.hostId !== userId) throw new ForbiddenException('Only host can delete channels');

    return prisma.channel.delete({ where: { id: channelId } });
  }

  async getPrivateChat(userId1: string, userId2: string) {
    const existingRoom = await prisma.room.findFirst({
      where: {
        type: 'social',
        privacy: 'private',
        AND: [
          { participants: { some: { userId: userId1 } } },
          { participants: { some: { userId: userId2 } } },
        ],
      },
      include: {
        channels: { where: { type: 'text' }, take: 1 },
        participants: { include: { user: true } },
      },
    });

    if (existingRoom) return existingRoom;

    const code = Array.from({ length: 8 }, () =>
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)],
    ).join('');

    return prisma.room.create({
      data: {
        name: 'Private Chat',
        type: 'social',
        privacy: 'private',
        code,
        hostId: userId1,
        channels: { create: { name: 'chat', type: 'text', position: 0 } },
        participants: {
          create: [
            { userId: userId1, role: 'host' },
            { userId: userId2, role: 'participant' },
          ],
        },
      },
      include: {
        channels: { where: { type: 'text' }, take: 1 },
        participants: { include: { user: true } },
      },
    });
  }
}
