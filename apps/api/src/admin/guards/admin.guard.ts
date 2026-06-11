import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { prisma } from '@viewnoveen/database';

@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    if (!userId) return false;

    const admin = await prisma.admin.findUnique({ where: { userId } });
    return !!admin;
  }
}
