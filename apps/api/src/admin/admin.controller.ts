import { Controller, Get, Post, Param, Query, UseGuards, Req, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get admin dashboard' })
  async getDashboard(@Req() req: any) {
    return this.adminService.getDashboard(req.user.id);
  }

  @Get('users')
  @ApiOperation({ summary: 'Get all users' })
  async getUsers(
    @Req() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
  ) {
    return this.adminService.getUsers(req.user.id, parseInt(page), parseInt(limit), search);
  }

  @Get('reports')
  @ApiOperation({ summary: 'Get reports' })
  async getReports(@Req() req: any, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.adminService.getReports(req.user.id, parseInt(page), parseInt(limit));
  }

  @Post('reports/:id/resolve')
  @ApiOperation({ summary: 'Resolve a report' })
  async resolveReport(@Req() req: any, @Param('id') id: string, @Body('action') action: string) {
    return this.adminService.resolveReport(req.user.id, id, action);
  }

  @Post('users/:id/toggle-verify')
  @ApiOperation({ summary: 'Toggle user verification' })
  async toggleVerify(@Req() req: any, @Param('id') id: string) {
    return this.adminService.toggleUserVerification(req.user.id, id);
  }

  @Post('users/:id/suspend')
  @ApiOperation({ summary: 'Suspend user' })
  async suspendUser(@Req() req: any, @Param('id') id: string) {
    return this.adminService.suspendUser(req.user.id, id);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get system analytics' })
  async getAnalytics(@Req() req: any) {
    return this.adminService.getAnalytics(req.user.id);
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get system logs' })
  async getLogs(@Req() req: any, @Query('page') page = '1', @Query('limit') limit = '50') {
    return this.adminService.getSystemLogs(req.user.id, parseInt(page), parseInt(limit));
  }
}
