import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a message' })
  async sendMessage(@Req() req: any, @Body() body: any) {
    return this.chatService.sendMessage(req.user.id, body);
  }

  @Get('channels/:channelId/messages')
  @ApiOperation({ summary: 'Get channel messages' })
  async getMessages(
    @Param('channelId') channelId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.chatService.getMessages(channelId, parseInt(page), parseInt(limit));
  }

  @Put('messages/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit a message' })
  async editMessage(@Req() req: any, @Param('id') id: string, @Body('content') content: string) {
    return this.chatService.editMessage(id, req.user.id, content);
  }

  @Delete('messages/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a message' })
  async deleteMessage(@Req() req: any, @Param('id') id: string) {
    return this.chatService.deleteMessage(id, req.user.id);
  }

  @Post('messages/:id/reactions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle reaction on a message' })
  async addReaction(@Req() req: any, @Param('id') id: string, @Body('emoji') emoji: string) {
    return this.chatService.addReaction(id, req.user.id, emoji);
  }

  @Get('rooms/:roomId/channels')
  @ApiOperation({ summary: 'Get room channels' })
  async getChannels(@Param('roomId') roomId: string) {
    return this.chatService.getChannels(roomId);
  }

  @Post('channels')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a channel' })
  async createChannel(@Req() req: any, @Body() body: any) {
    return this.chatService.createChannel(body);
  }

  @Delete('channels/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a channel' })
  async deleteChannel(@Req() req: any, @Param('id') id: string) {
    return this.chatService.deleteChannel(id, req.user.id);
  }

  @Post('private/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get or create private chat' })
  async getPrivateChat(@Req() req: any, @Param('userId') userId: string) {
    return this.chatService.getPrivateChat(req.user.id, userId);
  }
}
