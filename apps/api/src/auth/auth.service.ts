import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { prisma } from '@viewnoveen/database';
import { registerSchema, loginSchema } from '@viewnoveen/shared';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(data: { username: string; displayName: string; email: string; password: string }) {
    const validated = registerSchema.parse(data);

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: validated.email }, { username: validated.username }],
      },
    });

    if (existing) {
      if (existing.email === validated.email) {
        throw new ConflictException('Email already in use');
      }
      throw new ConflictException('Username already taken');
    }

    const passwordHash = await bcrypt.hash(validated.password, 12);

    const user = await prisma.user.create({
      data: {
        username: validated.username,
        displayName: validated.displayName,
        email: validated.email,
        passwordHash,
      },
    });

    const tokens = await this.generateTokens(user.id, user.email);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async login(data: { email: string; password: string }) {
    const validated = loginSchema.parse(data);

    const user = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(validated.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { isOnline: true, lastSeen: new Date() },
    });

    const tokens = await this.generateTokens(user.id, user.email);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async googleLogin(googleProfile: {
    id: string;
    email: string;
    displayName: string;
    avatar: string;
  }) {
    let account = await prisma.googleAccount.findUnique({
      where: { googleId: googleProfile.id },
      include: { user: true },
    });

    if (account) {
      await prisma.googleAccount.update({
        where: { id: account.id },
        data: {
          email: googleProfile.email,
          displayName: googleProfile.displayName,
          avatar: googleProfile.avatar,
        },
      });

      await prisma.user.update({
        where: { id: account.userId },
        data: { isOnline: true, lastSeen: new Date() },
      });

      const tokens = await this.generateTokens(account.user.id, account.user.email);
      return { user: this.sanitizeUser(account.user), ...tokens };
    }

    let user = await prisma.user.findUnique({
      where: { email: googleProfile.email },
    });

    if (!user) {
      const baseUsername = googleProfile.email.split('@')[0];
      let username = baseUsername;
      let counter = 1;
      while (await prisma.user.findUnique({ where: { username } })) {
        username = `${baseUsername}${counter}`;
        counter++;
      }

      user = await prisma.user.create({
        data: {
          username,
          displayName: googleProfile.displayName,
          email: googleProfile.email,
          avatar: googleProfile.avatar,
          isOnline: true,
        },
      });
    }

    await prisma.googleAccount.create({
      data: {
        userId: user.id,
        googleId: googleProfile.id,
        email: googleProfile.email,
        displayName: googleProfile.displayName,
        avatar: googleProfile.avatar,
        accessToken: '',
      },
    });

    const tokens = await this.generateTokens(user.id, user.email);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_SECRET'),
      });

      const session = await prisma.session.findUnique({
        where: { refreshToken },
        include: { user: true },
      });

      if (!session || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const tokens = await this.generateTokens(payload.sub, payload.email);

      return {
        user: this.sanitizeUser(session.user),
        ...tokens,
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string, refreshToken?: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { isOnline: false, lastSeen: new Date() },
    });

    if (refreshToken) {
      await prisma.session.deleteMany({
        where: { refreshToken },
      });
    }
  }

  async validateUser(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.sanitizeUser(user);
  }

  private async generateTokens(userId: string, email: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, email },
      {
        expiresIn: this.configService.get('JWT_EXPIRATION', '7d'),
      },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId, email, type: 'refresh' },
      {
        expiresIn: this.configService.get('REFRESH_TOKEN_EXPIRATION', '30d'),
      },
    );

    await prisma.session.create({
      data: {
        userId,
        token: accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: { id: string; username: string; displayName: string; email: string; avatar: string; banner: string; bio: string; status: string; isVerified: boolean; isOnline: boolean; lastSeen: Date; locale: string; theme: string; createdAt: Date; updatedAt: Date; passwordHash?: string | null }) {
    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }
}
