// Notification events (Phase 17). In-app notifications with optional
// entity links so the UI can deep-link from the bell menu.
// Transport architecture (email/SMS/Slack/Teams) is prepared but inert —
// add providers in dispatchChannels() when configured.

type TxClient = Parameters<Parameters<typeof import("./db").db.$transaction>[0]>[0];
type DbLike = typeof import("./db").db | TxClient;

export interface NotifyInput {
  organizationId: string;
  userId: string | null;
  title: string;
  body?: string | null;
  type?: "INFO" | "WARNING" | "SUCCESS" | "ERROR";
  entityType?: string | null;
  entityId?: string | null;
}

export async function notify(db: DbLike, input: NotifyInput) {
  try {
    return await db.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        title: input.title,
        body: input.body ?? null,
        type: input.type ?? "INFO",
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    });
  } catch {
    // notifications must never break the primary operation
    return null;
  }
}

/**
 * Fan-out helper: notify several users (or the whole org when userIds empty).
 */
export async function notifyMany(db: DbLike, organizationId: string, userIds: string[], input: Omit<NotifyInput, "organizationId" | "userId">) {
  if (userIds.length === 0) {
    return notify(db, { ...input, organizationId, userId: null });
  }
  return db.notification.createMany({
    data: userIds.map((userId) => ({
      organizationId,
      userId,
      title: input.title,
      body: input.body ?? null,
      type: input.type ?? "INFO",
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    })),
  });
}

/**
 * Channel dispatch architecture — intentionally a no-op registry.
 * Configure providers via env (EMAIL_PROVIDER, SLACK_WEBHOOK, …) and add
 * adapters here; the in-app notification is always written regardless.
 */
export async function dispatchChannels(_notificationId: string) {
  return { inApp: true, email: false, sms: false, slack: false, teams: false };
}
