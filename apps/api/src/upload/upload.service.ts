import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@viewnoveen/database';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadDir: string;
  private readonly maxFileSize: number;

  constructor(private readonly configService: ConfigService) {
    this.uploadDir = path.join(process.cwd(), 'uploads');
    this.maxFileSize = parseInt(configService.get('MAX_FILE_SIZE', '2147483648'));
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(
    userId: string,
    file: Express.Multer.File,
    options?: { transcoding?: boolean; generateThumbnail?: boolean },
  ) {
    if (file.size > this.maxFileSize) {
      throw new BadRequestException('File size exceeds maximum allowed size');
    }

    const allowedMimeTypes = [
      'video/mp4', 'video/x-matroska', 'video/avi', 'video/quicktime',
      'video/webm', 'video/x-msvideo',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
      'application/pdf', 'application/zip', 'application/x-rar-compressed',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }

    const ext = path.extname(file.originalname);
    const filename = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(this.uploadDir, filename);

    fs.writeFileSync(filePath, file.buffer);

    const upload = await prisma.upload.create({
      data: {
        userId,
        filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: `/uploads/${filename}`,
        status: 'completed',
      },
    });

    return upload;
  }

  async getUploads(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [uploads, total] = await Promise.all([
      prisma.upload.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.upload.count({ where: { userId } }),
    ]);

    return { data: uploads, total, page, limit, hasMore: skip + uploads.length < total };
  }

  async initiateCloudUpload(userId: string, fileData: { filename: string; size: number; mimeType: string }) {
    const upload = await prisma.upload.create({
      data: {
        userId,
        filename: fileData.filename,
        originalName: fileData.filename,
        mimeType: fileData.mimeType,
        size: fileData.size,
        url: '',
        status: 'pending',
      },
    });

    return {
      uploadId: upload.id,
      uploadUrl: `/api/upload/${upload.id}/complete`,
    };
  }

  async completeCloudUpload(uploadId: string, fileUrl: string) {
    return prisma.upload.update({
      where: { id: uploadId },
      data: { url: fileUrl, status: 'completed' },
    });
  }

  async getGoogleDriveFiles(accessToken: string) {
    const response = await fetch('https://www.googleapis.com/drive/v3/files', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      params: {
        q: "mimeType contains 'video/'",
        fields: 'files(id, name, mimeType, size, thumbnailLink, webContentLink, videoMediaMetadata)',
        pageSize: 50,
      },
    });

    if (!response.ok) {
      throw new BadRequestException('Failed to fetch Google Drive files');
    }

    const data = await response.json();
    return data.files || [];
  }

  async getGoogleDriveVideoUrl(fileId: string, accessToken: string) {
    return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${accessToken}`;
  }
}
