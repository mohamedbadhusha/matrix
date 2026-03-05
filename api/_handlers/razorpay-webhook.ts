import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase } from '../_lib/supabase-admin.js';
import crypto from 'crypto';


const TIER_MAP: Record<string, string> = {
  plan_pro_monthly: 'pro',
  plan_elite_monthly: 'elite',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const signature = req.headers['x-razorpay-signature'] as string;
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;

  // Verify HMAC signature
  const rawBody = JSON.stringify(req.body);
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature ?? ''), Buffer.from(expectedSig))) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body?.event as string;
  const payment = req.body?.payload?.payment?.entity;
  const notes = payment?.notes ?? {};

  if (event === 'payment.captured') {
    const userId = notes.userId as string;
    const tier = notes.tier as string;

    if (!userId || !tier) {
      return res.status(400).json({ error: 'Missing userId or tier in notes' });
    }

    // Map plan to tier
    const resolvedTier = TIER_MAP[payment?.description] ?? tier;

    // Update user tier
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        tier: resolvedTier,
        subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', userId);

    if (updateErr) {
      console.error('Failed to update tier:', updateErr.message);
      return res.status(500).json({ error: 'Failed to update tier' });
    }

    // Record subscription
    await supabase.from('subscriptions').upsert({
      user_id: userId,
      tier: resolvedTier,
      razorpay_subscription_id: payment?.order_id,
      payment_ref: payment?.id,
      amount: payment?.amount / 100,
      status: 'active',
      starts_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'payment_ref' });

    return res.status(200).json({ received: true });
  }

  if (event === 'payment.failed') {
    const userId = notes.userId as string;
    if (userId) {
      await supabase.from('subscriptions').insert({
        user_id: userId,
        tier: notes.tier ?? 'unknown',
        razorpay_subscription_id: payment?.order_id,
        payment_ref: payment?.id,
        amount: payment?.amount / 100,
        status: 'cancelled',
        starts_at: new Date().toISOString(),
      });
    }
    return res.status(200).json({ received: true });
  }

  // Unknown event — ack but ignore
  return res.status(200).json({ received: true });
}