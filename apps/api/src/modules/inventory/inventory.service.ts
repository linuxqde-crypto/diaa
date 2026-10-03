import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

/**
 * Inventory allocator — THE anti-double-sell mechanism.
 *
 * Invariants (non-negotiable):
 *  1. Codes are reserved ONLY after payment confirmation (caller guarantees this).
 *  2. Allocation runs inside the fulfillment transaction using
 *     `SELECT ... FOR UPDATE SKIP LOCKED` so two concurrent confirmations can never
 *     grab the same row — losers skip locked rows instead of blocking/deadlocking.
 *  3. AVAILABLE → SOLD transition happens in the SAME transaction that stamps
 *     orderId, so every sold code is always traceable to its order.
 */
@Injectable()
export class InventoryService {
  private readonly log = new Logger(InventoryService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Count of currently available codes for a product (public stock indicator). */
  async availableCount(productId: string): Promise<number> {
    return this.prisma.inventoryCode.count({ where: { productId, status: 'AVAILABLE' } });
  }

  /**
   * Atomically allocate `quantity` codes for `productId`, mark them SOLD and link to order.
   * Runs on the caller's transaction client — plaintext decryption happens only at delivery time.
   * Throws ConflictException when stock is insufficient (invoice stays PAID; admin restocks/refunds).
   */
  async allocateForOrder(params: {
    productId: string;
    quantity: number;
    orderId: string;
    tx: Prisma.TransactionClient;
  }): Promise<string[]> {
    const { productId, quantity, orderId, tx } = params;

    // Row-level lock: pick candidate ids under concurrency safety.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM inventory_codes
      WHERE "productId" = ${productId}::uuid AND status = 'AVAILABLE'
      ORDER BY "createdAt" ASC
      LIMIT ${quantity}
      FOR UPDATE SKIP LOCKED
    `;
    if (locked.length < quantity) {
      this.log.error(`OUT OF STOCK at fulfillment: product ${productId} needs ${quantity}, got ${locked.length}`);
      throw new ConflictException('نفدت الكمية أثناء التأكيد — سيتم إشعار الإدارة للتعبئة أو الاسترداد.');
    }
    const ids = locked.map((r) => r.id);

    const updated = await tx.$executeRaw`
      UPDATE inventory_codes
      SET status = 'SOLD', "orderId" = ${orderId}::uuid, "reservedAt" = now(), "soldAt" = now(), "updatedAt" = now()
      WHERE id = ANY(${ids}::uuid[]) AND status = 'AVAILABLE'
    `;
    if (updated !== ids.length) {
      // Defensive: throwing aborts the whole fulfillment transaction (Prisma rollback).
      throw new Error('ALLOCATION_RACE: code state changed mid-transaction');
    }
    this.log.log(`allocated ${ids.length} code(s) for order ${orderId}`);
    return ids;
  }

  /** Void codes (used by refund flows in PHASE 4 — sold codes are never returned to the pool). */
  async voidCodes(ids: string[], tx: Prisma.TransactionClient): Promise<void> {
    if (!ids.length) return;
    await tx.inventoryCode.updateMany({ where: { id: { in: ids } }, data: { status: 'VOID' } });
  }
}
