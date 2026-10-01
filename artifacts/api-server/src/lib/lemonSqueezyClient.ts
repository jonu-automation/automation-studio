import { createHmac } from "crypto";

const LS_API_BASE = "https://api.lemonsqueezy.com/v1";

function getApiKey(): string {
  const key = process.env.LEMONSQUEEZY_API_KEY;
  if (!key) throw new Error("LEMONSQUEEZY_API_KEY is not set");
  return key;
}

export function getStoreId(): string {
  const id = process.env.LEMONSQUEEZY_STORE_ID;
  if (!id) throw new Error("LEMONSQUEEZY_STORE_ID is not set");
  return id;
}

export function getVariantId(plan: "hobby" | "pro" | "team"): string {
  const map: Record<string, string | undefined> = {
    hobby: process.env.LEMONSQUEEZY_HOBBY_VARIANT_ID,
    pro: process.env.LEMONSQUEEZY_PRO_VARIANT_ID,
    team: process.env.LEMONSQUEEZY_TEAM_VARIANT_ID,
  };
  const id = map[plan];
  if (!id) throw new Error(`LEMONSQUEEZY_${plan.toUpperCase()}_VARIANT_ID is not set`);
  return id;
}

export function getPlanFromVariantId(variantId: string): string | null {
  const map: Record<string, string> = {};
  if (process.env.LEMONSQUEEZY_HOBBY_VARIANT_ID) map[process.env.LEMONSQUEEZY_HOBBY_VARIANT_ID] = "hobby";
  if (process.env.LEMONSQUEEZY_PRO_VARIANT_ID) map[process.env.LEMONSQUEEZY_PRO_VARIANT_ID] = "pro";
  if (process.env.LEMONSQUEEZY_TEAM_VARIANT_ID) map[process.env.LEMONSQUEEZY_TEAM_VARIANT_ID] = "team";
  return map[variantId] ?? null;
}

async function lsRequest(path: string, options?: RequestInit): Promise<unknown> {
  const res = await fetch(`${LS_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LemonSqueezy API ${res.status}: ${body}`);
  }
  return res.json();
}

export async function createCheckout(
  variantId: string,
  userEmail: string,
  userId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<string> {
  const storeId = getStoreId();
  const body = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_options: {
          embed: false,
          media: false,
          logo: true,
          desc: true,
          discount: false,
          button_color: "#f97316",
        },
        checkout_data: {
          email: userEmail,
          custom: { user_id: userId },
        },
        product_options: {
          redirect_url: successUrl,
          receipt_link_url: successUrl,
        },
        expires_at: null,
      },
      relationships: {
        store: { data: { type: "stores", id: storeId } },
        variant: { data: { type: "variants", id: variantId } },
      },
    },
  };

  const data = await lsRequest("/checkouts", { method: "POST", body: JSON.stringify(body) });
  return (data as { data: { attributes: { url: string } } }).data.attributes.url;
}

export async function getCustomerPortalUrl(email: string): Promise<string | null> {
  try {
    const storeId = getStoreId();
    const data = await lsRequest(
      `/customers?filter[email]=${encodeURIComponent(email)}&filter[store_id]=${storeId}`,
    ) as { data: Array<{ attributes: { urls: { customer_portal: string } } }> };
    return data.data?.[0]?.attributes?.urls?.customer_portal ?? null;
  } catch {
    return null;
  }
}

export function verifyWebhookSignature(payload: Buffer, signature: string): boolean {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) throw new Error("LEMONSQUEEZY_WEBHOOK_SECRET is not set");
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  return expected === signature;
}
