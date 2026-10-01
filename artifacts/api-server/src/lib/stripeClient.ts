import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";
import { logger } from "./logger";

const CONNECTOR_ID = "ccfg_stripe_01K611P4YQR0SZM11XFRQJC44Y";

async function fetchConnectorToken(): Promise<string | null> {
  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const identity = process.env["REPL_IDENTITY"];
  const renewal = process.env["WEB_REPL_RENEWAL"];

  if (!hostname || !identity) return null;

  try {
    const tokenRes = await fetch(
      `https://${hostname}/v1/token?id=${CONNECTOR_ID}`,
      {
        headers: {
          "X-Replit-Identity": identity,
          ...(renewal ? { "X-Replit-WEB-Renewal": renewal } : {}),
        },
      },
    );
    if (!tokenRes.ok) return null;
    const tokenData = (await tokenRes.json()) as { token: string };
    return tokenData.token;
  } catch {
    return null;
  }
}

async function getStripeSecretKey(): Promise<string> {
  const token = await fetchConnectorToken();
  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];

  if (token && hostname) {
    try {
      const credRes = await fetch(
        `https://${hostname}/v1/connectors/${CONNECTOR_ID}/connect`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      if (credRes.ok) {
        const credData = (await credRes.json()) as Record<string, string>;
        const key =
          credData["secretKey"] ??
          credData["secret_key"] ??
          credData["STRIPE_SECRET_KEY"] ??
          credData["stripeSecretKey"] ??
          "";
        if (key) return key;
      }
    } catch (err) {
      logger.warn({ err }, "Failed to fetch Stripe key from connector");
    }
  }

  const fallback = process.env["STRIPE_SECRET_KEY"];
  if (fallback) return fallback;

  throw new Error(
    "Stripe not configured. Please connect the Stripe integration via the workspace toolbar.",
  );
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = await getStripeSecretKey();
  return new Stripe(secretKey);
}

export async function getStripeSync(): Promise<StripeSync> {
  const secretKey = await getStripeSecretKey();
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL required");

  return new StripeSync({ stripeSecretKey: secretKey, databaseUrl } as import("stripe-replit-sync").StripeSyncConfig);
}
