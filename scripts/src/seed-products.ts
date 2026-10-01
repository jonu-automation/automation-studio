import { getUncachableStripeClient } from "../../artifacts/api-server/src/lib/stripeClient";

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  console.log("Checking for existing Pro Plan product...");
  const existing = await stripe.products.search({
    query: "name:'Pro Plan' AND active:'true'",
  });

  if (existing.data.length > 0) {
    const prod = existing.data[0];
    const prices = await stripe.prices.list({ product: prod.id, active: true });
    console.log(`Pro Plan already exists: ${prod.id}`);
    for (const p of prices.data) {
      console.log(`  Price: ${p.id} — ${p.unit_amount! / 100} ${p.currency.toUpperCase()}/${(p.recurring?.interval)}`);
    }
    return;
  }

  console.log("Creating Pro Plan product...");
  const proProduct = await stripe.products.create({
    name: "Pro Plan",
    description: "Unlimited workflows and runs, priority support",
  });
  console.log(`Created product: ${proProduct.id}`);

  const monthlyPrice = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 2900,
    currency: "usd",
    recurring: { interval: "month" },
  });
  console.log(`Monthly price: ${monthlyPrice.id} — $29.00/month`);

  const yearlyPrice = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 29000,
    currency: "usd",
    recurring: { interval: "year" },
  });
  console.log(`Yearly price: ${yearlyPrice.id} — $290.00/year`);

  console.log("Done! Webhooks will sync these to your database automatically.");
}

createProducts().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
