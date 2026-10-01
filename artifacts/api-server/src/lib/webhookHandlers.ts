import { verifyWebhookSignature, getPlanFromVariantId } from "./lemonSqueezyClient";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

interface LSWebhookEvent {
  meta: {
    event_name: string;
    custom_data?: { user_id?: string };
  };
  data: {
    id: string;
    attributes: {
      status: string;
      customer_id: number;
      variant_id: number;
    };
  };
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error("Payload must be a Buffer — ensure webhook route is registered before express.json()");
    }

    const isValid = verifyWebhookSignature(payload, signature);
    if (!isValid) throw new Error("Invalid webhook signature");

    const event = JSON.parse(payload.toString()) as LSWebhookEvent;
    const eventName = event.meta?.event_name;
    const data = event.data;

    logger.info({ eventName }, "LemonSqueezy webhook received");

    if (!eventName || !data) return;

    const customData = event.meta?.custom_data;
    const userId = customData?.user_id;
    const customerId = String(data.attributes?.customer_id);
    const subscriptionId = String(data.id);
    const variantId = String(data.attributes?.variant_id);
    const status = data.attributes?.status;

    let user: { id: string } | undefined;

    if (userId) {
      const rows = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId));
      user = rows[0];
    }

    if (!user && customerId) {
      const rows = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.lemonSqueezyCustomerId, customerId));
      user = rows[0];
    }

    if (!user) {
      logger.warn({ userId, customerId, eventName }, "LemonSqueezy webhook: user not found");
      return;
    }

    if (eventName === "subscription_created" || eventName === "subscription_updated") {
      if (status === "active") {
        const plan = getPlanFromVariantId(variantId) ?? "hobby";
        await db.update(usersTable).set({
          plan,
          lemonSqueezyCustomerId: customerId,
          lemonSqueezySubscriptionId: subscriptionId,
        }).where(eq(usersTable.id, user.id));
        logger.info({ userId: user.id, plan, eventName }, "Plan upgraded via LemonSqueezy");
      }
    } else if (eventName === "subscription_expired") {
      await db.update(usersTable).set({ plan: "free" }).where(eq(usersTable.id, user.id));
      logger.info({ userId: user.id, eventName }, "Plan downgraded to free (subscription expired)");
    }
  }
}
