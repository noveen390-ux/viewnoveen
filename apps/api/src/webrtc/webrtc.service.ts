import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import * as crypto from 'crypto';

@Injectable()
export class WebRTCService {
  private readonly logger = new Logger(WebRTCService.name);
  private readonly STUN_SERVERS: string[];
  private readonly TURN_SERVER: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.STUN_SERVERS = [
      this.configService.get('STUN_SERVER', 'stun.l.google.com:19302'),
    ];
    this.TURN_SERVER = this.configService.get('TURN_SERVER', '');
  }

  async getIceServers(): Promise<RTCIceServer[]> {
    const servers: RTCIceServer[] = this.STUN_SERVERS.map((server) => ({
      urls: `stun:${server}`,
    }));

    if (this.TURN_SERVER) {
      const credentials = await this.generateTurnCredentials();
      servers.push({
        urls: `turn:${this.TURN_SERVER}`,
        username: credentials.username,
        credential: credentials.credential,
      });
    }

    return servers;
  }

  private async generateTurnCredentials(): Promise<{
    username: string;
    credential: string;
  }> {
    const username = `${Date.now()}:${crypto.randomBytes(8).toString('hex')}`;
    const credential = crypto
      .createHmac('sha1', this.configService.get('TURN_CREDENTIAL', 'viewnoveen-secret'))
      .update(username)
      .digest('base64');

    return { username, credential };
  }

  async storePendingOffer(offer: {
    userId: string;
    targetUserId: string;
    roomId: string;
    sdp: string;
  }) {
    const key = `webrtc:offer:${offer.targetUserId}:${offer.userId}`;
    await this.redisService.set(key, JSON.stringify(offer), 30);
  }

  async getPendingOffer(userId: string, fromUserId: string): Promise<any | null> {
    const key = `webrtc:offer:${userId}:${fromUserId}`;
    const data = await this.redisService.get(key);
    return data ? JSON.parse(data) : null;
  }

  getAudioConstraints(): MediaTrackConstraints {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
      channelCount: 1,
    };
  }

  getVideoConstraints(): MediaTrackConstraints {
    return {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    };
  }
}
