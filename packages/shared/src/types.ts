export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatar: string;
  banner: string;
  bio: string;
  status: UserStatus;
  isVerified: boolean;
  isOnline: boolean;
  lastSeen: string;
  createdAt: string;
  updatedAt: string;
}

export type UserStatus = 'online' | 'idle' | 'dnd' | 'invisible';

export interface Room {
  id: string;
  name: string;
  description: string;
  code: string;
  type: RoomType;
  privacy: RoomPrivacy;
  hostId: string;
  host: User;
  video: RoomVideo | null;
  participants: RoomParticipant[];
  participantCount: number;
  maxParticipants: number;
  tags: string[];
  thumbnail: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RoomType = 'watch' | 'music' | 'social';
export type RoomPrivacy = 'public' | 'private' | 'friends';

export interface RoomVideo {
  id: string;
  roomId: string;
  title: string;
  url: string;
  thumbnail: string;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  source: VideoSource;
  sourceId: string;
  addedBy: string;
  addedAt: string;
}

export type VideoSource = 'youtube' | 'google_drive' | 'local' | 'direct';

export interface RoomParticipant {
  id: string;
  roomId: string;
  userId: string;
  user: User;
  role: ParticipantRole;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  joinedAt: string;
}

export type ParticipantRole = 'host' | 'co_host' | 'moderator' | 'participant';

export interface Message {
  id: string;
  roomId: string;
  channelId: string;
  senderId: string;
  sender: User;
  type: MessageType;
  content: string;
  replyTo: string | null;
  attachments: Attachment[];
  reactions: MessageReaction[];
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'system' | 'voice';

export interface Attachment {
  id: string;
  type: AttachmentType;
  url: string;
  name: string;
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
}

export type AttachmentType = 'image' | 'video' | 'audio' | 'file';

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  user: User;
  emoji: string;
  createdAt: string;
}

export interface Channel {
  id: string;
  roomId: string;
  name: string;
  type: ChannelType;
  topic: string;
  isVoice: boolean;
  bitrate: number;
  userLimit: number;
  position: number;
  createdAt: string;
}

export type ChannelType = 'text' | 'voice' | 'announcement';

export interface VoiceState {
  userId: string;
  channelId: string;
  roomId: string;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  ssrc: number | null;
}

export interface SyncAction {
  type: SyncActionType;
  roomId: string;
  userId: string;
  data: SyncActionData;
  timestamp: number;
  sequenceId: number;
}

export type SyncActionType = 'play' | 'pause' | 'seek' | 'rate_change' | 'volume_change' | 'video_change' | 'sync_request' | 'sync_response';

export interface SyncActionData {
  currentTime?: number;
  playbackRate?: number;
  volume?: number;
  videoId?: string;
  timestamp?: number;
}

export interface WebRTCOffer {
  type: 'offer';
  sdp: string;
  userId: string;
  targetUserId: string;
  roomId: string;
}

export interface WebRTCAnswer {
  type: 'answer';
  sdp: string;
  userId: string;
  targetUserId: string;
  roomId: string;
}

export interface WebRTCICECandidate {
  type: 'ice_candidate';
  candidate: string;
  sdpMid: string;
  sdpMLineIndex: number;
  userId: string;
  targetUserId: string;
  roomId: string;
}

export interface Friend {
  id: string;
  userId: string;
  friendId: string;
  friend: User;
  status: FriendStatus;
  createdAt: string;
}

export type FriendStatus = 'pending' | 'accepted' | 'blocked';

export interface Community {
  id: string;
  name: string;
  description: string;
  avatar: string;
  banner: string;
  ownerId: string;
  type: 'public' | 'private';
  memberCount: number;
  createdAt: string;
}

export interface MusicSession {
  id: string;
  roomId: string;
  name: string;
  currentTrack: MusicTrack | null;
  queue: MusicTrack[];
  isPlaying: boolean;
  currentTime: number;
  djId: string;
  mode: 'collaborative' | 'dj';
  createdAt: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  url: string;
  thumbnail: string;
  source: string;
  addedBy: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'room_invite'
  | 'party_invite'
  | 'message'
  | 'mention'
  | 'call'
  | 'follow'
  | 'like'
  | 'comment';

export interface AIRecommendation {
  type: 'video' | 'friend' | 'room' | 'music';
  score: number;
  reason: string;
  data: Record<string, unknown>;
}

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidence: number;
}

export interface ConversationSummary {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
}

export interface AdminUser extends User {
  role: AdminRole;
  permissions: string[];
}

export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'support';

export interface Analytics {
  totalUsers: number;
  activeUsers: number;
  totalRooms: number;
  activeRooms: number;
  totalMessages: number;
  totalCalls: number;
  peakConcurrent: number;
  averageSessionDuration: number;
  timestamp: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SyncEngineMetrics {
  roomId: string;
  participantCount: number;
  averageLatency: number;
  maxLatency: number;
  minLatency: number;
  syncInterval: number;
  lastSyncTimestamp: number;
  driftCorrections: number;
  reconnections: number;
}
