import { Controller, Post, Get, Delete, Param, Query, UseGuards, Req, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SocialService } from './social.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Social')
@Controller('social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Post('friends/request/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send friend request' })
  async sendRequest(@Req() req: any, @Param('userId') userId: string) {
    return this.socialService.sendFriendRequest(req.user.id, userId);
  }

  @Post('friends/accept/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept friend request' })
  async acceptRequest(@Req() req: any, @Param('userId') userId: string) {
    return this.socialService.acceptFriendRequest(req.user.id, userId);
  }

  @Delete('friends/reject/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject friend request' })
  async rejectRequest(@Req() req: any, @Param('userId') userId: string) {
    return this.socialService.rejectFriendRequest(req.user.id, userId);
  }

  @Delete('friends/:friendId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove friend' })
  async removeFriend(@Req() req: any, @Param('friendId') friendId: string) {
    return this.socialService.removeFriend(req.user.id, friendId);
  }

  @Get('friends')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get friends list' })
  async getFriends(@Req() req: any, @Query('page') page = '1', @Query('limit') limit = '50') {
    return this.socialService.getFriends(req.user.id, parseInt(page), parseInt(limit));
  }

  @Get('friends/requests')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pending friend requests' })
  async getRequests(@Req() req: any) {
    return this.socialService.getPendingRequests(req.user.id);
  }

  @Post('follow/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle follow user' })
  async followUser(@Req() req: any, @Param('userId') userId: string) {
    return this.socialService.followUser(req.user.id, userId);
  }

  @Get(':userId/followers')
  @ApiOperation({ summary: 'Get user followers' })
  async getFollowers(@Param('userId') userId: string, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.socialService.getFollowers(userId, parseInt(page), parseInt(limit));
  }

  @Get(':userId/following')
  @ApiOperation({ summary: 'Get who user follows' })
  async getFollowing(@Param('userId') userId: string, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.socialService.getFollowing(userId, parseInt(page), parseInt(limit));
  }

  @Post('communities')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a community' })
  async createCommunity(@Req() req: any, @Body() body: any) {
    return this.socialService.createCommunity(req.user.id, body);
  }

  @Get('communities')
  @ApiOperation({ summary: 'Get public communities' })
  async getCommunities(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.socialService.getCommunities(parseInt(page), parseInt(limit));
  }
}
