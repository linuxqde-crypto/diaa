import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

/**
 * Immutable audit trail for EVERY financial/admin action (non-negotiable requirement).
 * The DB trigger `forbid_mutation_of_immutable_tables` blocks UPDATE/DELETE on audit_logs —
 * this service only ever appends. Never put secret codes or full keys in metadata.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    action: AuditAction;
    entityType: string;
    entityId?: string | null;
    actorEmail?: string | null;
    metadata?: Prisma.InputJsonValue;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId ?? null,
          actorEmail: params.actorEmail ?? null,
          metadata: params.metadata ?? undefined,
          ip: params.ip ?? null,
          userAgent: params.userAgent ?? null,
        },
      });
    } catch (e) {
      // Audit failure must never break a payment flow, but must scream in logs.
      console.error('[audit] FAILED to write audit log:', params.action, e);
    }
  }
}
