import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env";

interface VapidKeyPair {
  publicKey: string;
  privateKey: string;
  subject: string;
  isDevGenerated: boolean;
}

let cachedVapid: VapidKeyPair | null = null;

/**
 * Resolves VAPID keys from environment variables, or generates and caches a
 * local development keypair in `.orbit-vapid.json` when running outside production
 * so Web Push can be tested immediately on localhost without manual setup.
 */
export function resolveVapidKeys(): VapidKeyPair | null {
  if (cachedVapid) return cachedVapid;

  const env = getServerEnv();
  const pub = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.trim();
  const priv = env.VAPID_PRIVATE_KEY.trim();
  const subject = env.VAPID_SUBJECT.trim() || "mailto:orbit@example.com";

  if (pub && priv) {
    cachedVapid = {
      publicKey: pub,
      privateKey: priv,
      subject,
      isDevGenerated: false,
    };
    return cachedVapid;
  }

  if (env.NODE_ENV === "production") {
    return null;
  }

  const cacheFile = path.join(process.cwd(), ".orbit-vapid.json");
  try {
    if (fs.existsSync(cacheFile)) {
      const parsed = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as {
        publicKey?: string;
        privateKey?: string;
      };
      if (parsed.publicKey && parsed.privateKey) {
        cachedVapid = {
          publicKey: parsed.publicKey,
          privateKey: parsed.privateKey,
          subject,
          isDevGenerated: true,
        };
        return cachedVapid;
      }
    }
  } catch {
    // Fall through to generate fresh local keys
  }

  const generated = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(
      cacheFile,
      JSON.stringify(
        {
          publicKey: generated.publicKey,
          privateKey: generated.privateKey,
        },
        null,
        2
      ),
      "utf8"
    );
  } catch {
    // Non-fatal if filesystem is read-only
  }

  cachedVapid = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    subject,
    isDevGenerated: true,
  };
  return cachedVapid;
}

export function getPublicVapidKey(): string | null {
  return resolveVapidKeys()?.publicKey ?? null;
}

export interface WebPushPayload {
  title: string;
  body: string;
  actionUrl: string;
  tag?: string;
}

export interface PushDispatchSummary {
  attempted: number;
  delivered: number;
  deactivated: number;
}

export async function sendPushToUserDevices(
  userId: string,
  payload: WebPushPayload
): Promise<PushDispatchSummary> {
  const vapid = resolveVapidKeys();
  if (!vapid) {
    return { attempted: 0, delivered: 0, deactivated: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId, isActive: true },
  });

  if (subscriptions.length === 0) {
    return { attempted: 0, delivered: 0, deactivated: 0 };
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  const serialized = JSON.stringify(payload);

  let delivered = 0;
  let deactivated = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dhKey,
              auth: sub.authKey,
            },
          },
          serialized,
          { TTL: 3600 }
        );
        delivered += 1;
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastUsedAt: new Date() },
        });
      } catch (err) {
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        console.error(
          `[WebPush] Delivery failed for subscription ${sub.id}: status=${statusCode}`,
          err
        );
        // 404/410: endpoint unregistered/gone
        // 401/403: VAPID credentials mismatch or unauthorized subscription
        if (
          statusCode === 404 ||
          statusCode === 410 ||
          statusCode === 401 ||
          statusCode === 403
        ) {
          deactivated += 1;
          await prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { isActive: false },
          });
        }
      }
    })
  );

  return {
    attempted: subscriptions.length,
    delivered,
    deactivated,
  };
}
