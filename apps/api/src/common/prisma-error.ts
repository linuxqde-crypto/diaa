import { ConflictException, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Maps low-level Prisma errors to meaningful HTTP exceptions.
 * P2025 → 404 (record not found), P2003 → 409 (FK constraint, e.g. insufficient stock).
 */
export function mapPrismaError(e: unknown): Error {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2025') return new HttpException('المورد غير موجود', 404);
    if (e.code === 'P2003') {
      return new ConflictException(
        'الكمية المتاحة غير كافية لأحد العناصر — تم رفض الطلب.',
      );
    }
  }
  return e instanceof Error ? e : new Error(String(e));
}
