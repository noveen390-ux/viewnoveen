import {
  Controller, Post, Get, Param, Query, UseGuards, Req, UseInterceptors,
  UploadedFile, BadRequestException, Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('file')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a file' })
  async uploadFile(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    return this.uploadService.uploadFile(req.user.id, file);
  }

  @Get('files')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user uploads' })
  async getUploads(
    @Req() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.uploadService.getUploads(req.user.id, parseInt(page), parseInt(limit));
  }

  @Post('google-drive/files')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List Google Drive video files' })
  async getGoogleDriveFiles(@Req() req: any, @Body('accessToken') accessToken: string) {
    return this.uploadService.getGoogleDriveFiles(accessToken);
  }

  @Get('google-drive/:fileId/url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Google Drive video streaming URL' })
  async getGoogleDriveUrl(
    @Req() req: any,
    @Param('fileId') fileId: string,
    @Query('accessToken') accessToken: string,
  ) {
    return this.uploadService.getGoogleDriveVideoUrl(fileId, accessToken);
  }
}
