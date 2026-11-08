import { headers } from "next/headers";
import { auth } from "./auth";
import { prisma } from "@/lib/db/prisma";

/**
 * Retrieves the currently authenticated user session on the server.
 * In local development when seeded with the demo persona and no active cookie,
 * optionally resolves the default seeded demo user if ORBIT_DEMO_FALLBACK !== "false".
 */
export async function getCurrentUser() {
  try {
    const reqHeaders = await headers();
    const session = await auth.api.getSession({
      headers: reqHeaders,
    });

    if (session?.user) {
      return session.user;
    }
  } catch {
    // Fall through to demo user lookup if DB is unavailable or headers context missing
  }

  if (process.env.NODE_ENV !== "production" && process.env.ORBIT_DEMO_FALLBACK !== "false") {
    try {
      const demoUser = await prisma.user.findFirst({
        orderBy: { createdAt: "asc" },
      });
      if (demoUser) {
        return demoUser;
      }
    } catch {
      return null;
    }
  }

  return null;
}
