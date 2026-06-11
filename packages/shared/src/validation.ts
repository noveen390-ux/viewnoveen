import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(50),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['watch', 'music', 'social']).default('watch'),
  privacy: z.enum(['public', 'private', 'friends']).default('public'),
  maxParticipants: z.number().int().min(1).max(500).default(50),
  tags: z.array(z.string().max(20)).max(10).optional(),
});

export const updateRoomSchema = createRoomSchema.partial();

export const inviteUserSchema = z.object({
  roomId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
});

export const sendMessageSchema = z.object({
  roomId: z.string().uuid(),
  channelId: z.string().uuid(),
  content: z.string().max(4000),
  replyTo: z.string().uuid().optional(),
  type: z.enum(['text', 'image', 'video', 'audio', 'file', 'voice']).default('text'),
});

export const editMessageSchema = z.object({
  content: z.string().max(4000),
});

export const createChannelSchema = z.object({
  roomId: z.string().uuid(),
  name: z.string().min(1).max(100),
  type: z.enum(['text', 'voice', 'announcement']).default('text'),
  topic: z.string().max(200).optional(),
  isVoice: z.boolean().default(false),
  bitrate: z.number().int().min(8).max(512).optional(),
  userLimit: z.number().int().min(0).max(99).default(0),
});

export const syncActionSchema = z.object({
  type: z.enum(['play', 'pause', 'seek', 'rate_change', 'volume_change', 'video_change']),
  roomId: z.string().uuid(),
  data: z.object({
    currentTime: z.number().min(0).optional(),
    playbackRate: z.number().min(0.25).max(4).optional(),
    volume: z.number().min(0).max(1).optional(),
    videoId: z.string().optional(),
    timestamp: z.number().optional(),
  }),
});

export const googleDriveVideoSchema = z.object({
  fileId: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(500).optional(),
  avatar: z.string().url().optional(),
  banner: z.string().url().optional(),
  status: z.enum(['online', 'idle', 'dnd', 'invisible']).optional(),
});

export const addFriendSchema = z.object({
  userId: z.string().uuid(),
});

export const createCommunitySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  type: z.enum(['public', 'private']).default('public'),
});

export const createMusicSessionSchema = z.object({
  roomId: z.string().uuid(),
  name: z.string().min(1).max(100),
  mode: z.enum(['collaborative', 'dj']).default('collaborative'),
});

export const addTrackSchema = z.object({
  sessionId: z.string().uuid(),
  title: z.string(),
  artist: z.string(),
  album: z.string().optional(),
  duration: z.number(),
  url: z.string().url(),
  thumbnail: z.string().url().optional(),
});

export const reportSchema = z.object({
  targetId: z.string().uuid(),
  targetType: z.enum(['user', 'room', 'message', 'community']),
  reason: z.string().min(10).max(1000),
  category: z.enum(['spam', 'harassment', 'inappropriate', 'other']),
});
