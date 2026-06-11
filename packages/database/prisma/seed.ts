import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@viewnoveen.com' },
    update: {},
    create: {
      username: 'admin',
      displayName: 'ViewNoveen Admin',
      email: 'admin@viewnoveen.com',
      isVerified: true,
      isOnline: false,
    },
  });

  await prisma.admin.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: {
      userId: adminUser.id,
      role: 'super_admin',
      permissions: ['*'],
    },
  });

  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@viewnoveen.com' },
    update: {},
    create: {
      username: 'demo',
      displayName: 'Demo User',
      email: 'demo@viewnoveen.com',
      isVerified: true,
    },
  });

  const roomCode = Array.from({ length: 8 }, () =>
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)],
  ).join('');

  const room = await prisma.room.create({
    data: {
      name: 'Welcome to ViewNoveen',
      description: 'First room! Watch trailers and hang out.',
      code: roomCode,
      type: 'watch',
      privacy: 'public',
      hostId: adminUser.id,
      maxParticipants: 100,
      tags: ['welcome', 'trailers', 'fun'],
      channels: {
        create: [
          { name: 'general', type: 'text', position: 0 },
          { name: 'Voice Chat', type: 'voice', isVoice: true, bitrate: 64, position: 1 },
          { name: 'announcements', type: 'announcement', position: 2 },
        ],
      },
      participants: {
        create: [
          { userId: adminUser.id, role: 'host' },
          { userId: demoUser.id, role: 'co_host' },
        ],
      },
    },
  });

  console.log(`Room created: ${room.name} (${room.code})`);
  console.log(`Admin: ${adminUser.email}`);
  console.log(`Demo: ${demoUser.email}`);
  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
