import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/catalog";
import { customerAuthFeatures } from "@/lib/customer-auth-config";
import {
  veloraConfigured,
  veloraWebhookConfigured,
} from "@/lib/payments/velora";
import { shippingConfigured } from "@/lib/shipping/melhor-envio";
import { json, failure } from "@/lib/http";
export async function GET() {
  try {
    await requireAdmin();
    const { data, error } = await db().rpc("commerce_scheduler_status");
    const auth = customerAuthFeatures();
    return json({
      pix_configured: veloraConfigured(),
      pix_webhook_configured: veloraWebhookConfigured(),
      shipping_configured: shippingConfigured(),
      customer_signup_enabled: auth.emailSignup,
      google_enabled: auth.google,
      apple_enabled: auth.apple,
      scheduler: error ? null : data,
    });
  } catch (e) {
    return failure(e);
  }
}
