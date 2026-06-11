import { Controller, Get, Put, Param, Query, UseGuards, Req, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getMe(@Req() req: any) {
    return this.usersService.getProfile(req.user.id);
  }

  @Put('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update profile' })
  async updateProfile(@Req() req: any, @Body() body: any) {
    return this.usersService.updateProfile(req.user.id, body);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search users' })
  async searchUsers(@Query('q') query: string, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.usersService.searchUsers(query, parseInt(page), parseInt(limit));
  }

  @Get(':username')
  @ApiOperation({ summary: 'Get public profile by username' })
  async getProfile(@Param('username') username: string) {
    return this.usersService.getPublicProfile(username);
  }

  @Get(':id/rooms')
  @ApiOperation({ summary: 'Get user rooms' })
  async getUserRooms(@Param('id') id: string, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.usersService.getUserRooms(id, parseInt(page), parseInt(limit));
  }

  @Put('me/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user status' })
  async setStatus(@Req() req: any, @Body('status') status: string) {
    return this.usersService.setStatus(req.user.id, status);
  }
}
