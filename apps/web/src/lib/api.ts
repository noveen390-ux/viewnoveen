import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const { data } = await axios.post('/api/auth/refresh', { refreshToken });
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
          }
          return api(originalRequest);
        }
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;

export const authApi = {
  register: (data: { username: string; displayName: string; email: string; password: string }) =>
    api.post('/api/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/api/auth/login', data),
  refresh: (refreshToken: string) =>
    api.post('/api/auth/refresh', { refreshToken }),
  logout: (refreshToken?: string) =>
    api.post('/api/auth/logout', { refreshToken }),
  getMe: () => api.get('/api/auth/me'),
  googleAuth: () => api.get('/api/auth/google'),
};

export const roomsApi = {
  create: (data: any) => api.post('/api/rooms', data),
  get: (id: string) => api.get(`/api/rooms/${id}`),
  getByCode: (code: string) => api.get(`/api/rooms/code/${code}`),
  update: (id: string, data: any) => api.put(`/api/rooms/${id}`, data),
  delete: (id: string) => api.delete(`/api/rooms/${id}`),
  join: (id: string) => api.post(`/api/rooms/${id}/join`),
  leave: (id: string) => api.post(`/api/rooms/${id}/leave`),
  search: (q: string, page = 1) => api.get('/api/rooms/search', { params: { q, page } }),
  setVideo: (id: string, data: any) => api.post(`/api/rooms/${id}/video`, data),
  deleteVideo: (id: string) => api.delete(`/api/rooms/${id}/video`),
  getParticipants: (id: string) => api.get(`/api/rooms/${id}/participants`),
};

export const chatApi = {
  sendMessage: (data: any) => api.post('/api/chat/messages', data),
  getMessages: (channelId: string, page = 1) =>
    api.get(`/api/chat/channels/${channelId}/messages`, { params: { page } }),
  editMessage: (id: string, content: string) =>
    api.put(`/api/chat/messages/${id}`, { content }),
  deleteMessage: (id: string) => api.delete(`/api/chat/messages/${id}`),
  addReaction: (id: string, emoji: string) =>
    api.post(`/api/chat/messages/${id}/reactions`, { emoji }),
  getChannels: (roomId: string) => api.get(`/api/chat/rooms/${roomId}/channels`),
  createChannel: (data: any) => api.post('/api/chat/channels', data),
  getPrivateChat: (userId: string) => api.post(`/api/chat/private/${userId}`),
};

export const socialApi = {
  sendFriendRequest: (userId: string) => api.post(`/api/social/friends/request/${userId}`),
  acceptFriendRequest: (userId: string) => api.post(`/api/social/friends/accept/${userId}`),
  rejectFriendRequest: (userId: string) => api.delete(`/api/social/friends/reject/${userId}`),
  removeFriend: (friendId: string) => api.delete(`/api/social/friends/${friendId}`),
  getFriends: (page = 1) => api.get('/api/social/friends', { params: { page } }),
  getFriendRequests: () => api.get('/api/social/friends/requests'),
  follow: (userId: string) => api.post(`/api/social/follow/${userId}`),
  getFollowers: (userId: string) => api.get(`/api/social/${userId}/followers`),
  getFollowing: (userId: string) => api.get(`/api/social/${userId}/following`),
  createCommunity: (data: any) => api.post('/api/social/communities', data),
  getCommunities: (page = 1) => api.get('/api/social/communities', { params: { page } }),
};

export const usersApi = {
  getProfile: (username: string) => api.get(`/api/users/${username}`),
  search: (q: string) => api.get('/api/users/search', { params: { q } }),
  updateProfile: (data: any) => api.put('/api/users/me', data),
  setStatus: (status: string) => api.put('/api/users/me/status', { status }),
  getRooms: (userId: string) => api.get(`/api/users/${userId}/rooms`),
};

export const uploadApi = {
  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/api/upload/file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getFiles: (page = 1) => api.get('/api/upload/files', { params: { page } }),
  getGoogleDriveFiles: (accessToken: string) =>
    api.post('/api/upload/google-drive/files', { accessToken }),
  getGoogleDriveUrl: (fileId: string, accessToken: string) =>
    api.get(`/api/upload/google-drive/${fileId}/url`, { params: { accessToken } }),
};

export const musicApi = {
  createSession: (data: any) => api.post('/api/music/sessions', data),
  getSession: (id: string) => api.get(`/api/music/sessions/${id}`),
  getSessionByRoom: (roomId: string) => api.get(`/api/music/rooms/${roomId}/session`),
  addTrack: (data: any) => api.post('/api/music/tracks', data),
  removeTrack: (id: string) => api.delete(`/api/music/tracks/${id}`),
  getQueue: (sessionId: string) => api.get(`/api/music/sessions/${sessionId}/queue`),
  updatePlayback: (id: string, data: any) => api.put(`/api/music/sessions/${id}/playback`, data),
};

export const aiApi = {
  getRecommendations: (type: string) => api.get(`/api/ai/recommendations/${type}`),
  translate: (text: string, targetLanguage: string) =>
    api.post('/api/ai/translate', { text, targetLanguage }),
  summarize: (messages: { content: string; sender: string }[]) =>
    api.post('/api/ai/summarize', { messages }),
};

export const adminApi = {
  getDashboard: () => api.get('/api/admin/dashboard'),
  getUsers: (page = 1, search?: string) =>
    api.get('/api/admin/users', { params: { page, search } }),
  getReports: (page = 1) => api.get('/api/admin/reports', { params: { page } }),
  resolveReport: (id: string, action: string) =>
    api.post(`/api/admin/reports/${id}/resolve`, { action }),
  toggleVerify: (userId: string) =>
    api.post(`/api/admin/users/${userId}/toggle-verify`),
  suspendUser: (userId: string) =>
    api.post(`/api/admin/users/${userId}/suspend`),
  getAnalytics: () => api.get('/api/admin/analytics'),
};
