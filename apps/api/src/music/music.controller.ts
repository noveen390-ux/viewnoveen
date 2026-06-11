import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MusicService } from './music.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Music')
@Controller('music')
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  @Post('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a music session' })
  async createSession(@Req() req: any, @Body() body: any) {
    return this.musicService.createSession(req.user.id, body);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get music session' })
  async getSession(@Param('id') id: string) {
    return this.musicService.getSession(id);
  }

  @Get('rooms/:roomId/session')
  @ApiOperation({ summary: 'Get session by room' })
  async getSessionByRoom(@Param('roomId') roomId: string) {
    return this.musicService.getSessionByRoom(roomId);
  }

  @Post('tracks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add track to queue' })
  async addTrack(@Req() req: any, @Body() body: any) {
    return this.musicService.addTrack(req.user.id, body);
  }

  @Delete('tracks/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove track from queue' })
  async removeTrack(@Req() req: any, @Param('id') id: string) {
    return this.musicService.removeTrack(id, req.user.id);
  }

  @Get('sessions/:id/queue')
  @ApiOperation({ summary: 'Get session queue' })
  async getQueue(@Param('id') id: string) {
    return this.musicService.getQueue(id);
  }

  @Put('sessions/:id/playback')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update playback state' })
  async updatePlayback(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.musicService.updatePlayback(id, body);
  }
}
