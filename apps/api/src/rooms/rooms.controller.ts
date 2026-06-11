import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Rooms')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a watch party room' })
  async createRoom(@Req() req: any, @Body() body: any) {
    return this.roomsService.createRoom(req.user.id, body);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search public rooms' })
  async searchRooms(@Query('q') query: string, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.roomsService.searchRooms(query, parseInt(page), parseInt(limit));
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Get room by invite code' })
  async getRoomByCode(@Param('code') code: string) {
    return this.roomsService.getRoomByCode(code);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get room details' })
  async getRoom(@Param('id') id: string) {
    return this.roomsService.getRoom(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update room settings' })
  async updateRoom(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.roomsService.updateRoom(id, req.user.id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a room' })
  async deleteRoom(@Req() req: any, @Param('id') id: string) {
    return this.roomsService.deleteRoom(id, req.user.id);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Join a room' })
  async joinRoom(@Req() req: any, @Param('id') id: string) {
    return this.roomsService.joinRoom(id, req.user.id);
  }

  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Leave a room' })
  async leaveRoom(@Req() req: any, @Param('id') id: string) {
    return this.roomsService.leaveRoom(id, req.user.id);
  }

  @Get(':id/participants')
  @ApiOperation({ summary: 'Get room participants' })
  async getParticipants(@Param('id') id: string) {
    return this.roomsService.getParticipants(id);
  }

  @Post(':id/video')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set current video' })
  async setVideo(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.roomsService.setVideo(id, req.user.id, body);
  }

  @Put(':id/participants/:userId/role')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update participant role' })
  async updateRole(@Req() req: any, @Param('id') id: string, @Param('userId') userId: string, @Body('role') role: string) {
    return this.roomsService.updateParticipantRole(id, req.user.id, userId, role);
  }
}
