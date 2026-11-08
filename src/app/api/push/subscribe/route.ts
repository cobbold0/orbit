import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getPublicVapidKey } from "@/lib/push/web-push";
import {
  registerUserPushSubscription,
  removeUserPushSubscription,
} from "@/modules/notifications/notification-service";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  deviceName: z.string().max(80).optional(),
});

const removeSchema = z.object({
  subscriptionId: z.string().min(1),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    vapidPublicKey: getPublicVapidKey(),
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = subscribeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid push subscription payload." },
      { status: 400 }
    );
  }

  const userAgent = request.headers.get("user-agent") ?? null;
  const sub = await registerUserPushSubscription(user.id, {
    endpoint: parsed.data.endpoint,
    p256dhKey: parsed.data.keys.p256dh,
    authKey: parsed.data.keys.auth,
    userAgent,
    deviceName: parsed.data.deviceName ?? "This browser",
  });

  return NextResponse.json({ ok: true, id: sub.id });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = removeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  await removeUserPushSubscription(user.id, parsed.data.subscriptionId);
  return NextResponse.json({ ok: true });
}
