/**
 * MU6 Email Notification Service
 *
 * Email delivery via Resend REST API.
 * On native (iOS/Android): calls Resend directly with the API key.
 * On web: proxies through a Supabase Edge Function to avoid CORS.
 *
 * All functions are fire-and-forget: they never throw, never block the UI,
 * and log success/failure to console.
 */

import { Platform } from 'react-native';

const RESEND_API_KEY = process.env.EXPO_PUBLIC_RESEND_API_KEY ?? '';
const FROM_ADDRESS = 'MU6 <onboarding@resend.dev>';

// Supabase Edge Function URL — used on web to avoid CORS (browser blocks direct Resend calls)
const SUPABASE_EMAIL_URL = 'https://ukavmvxelsfdfktiiyvg.supabase.co/functions/v1/send-email';

// ────────────────────────────────────────────
// Core send function
// ────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    console.log('[email] Sending to:', to, '| Subject:', subject);
    try {
        let data: any;

        if (Platform.OS === 'web') {
            // Web: proxy through Supabase Edge Function to avoid CORS
            const res = await fetch(SUPABASE_EMAIL_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to, subject, html }),
            });
            data = await res.json();
        } else {
            // Native: call Resend directly (no CORS restriction)
            if (!RESEND_API_KEY) {
                console.warn('[email] EXPO_PUBLIC_RESEND_API_KEY not set — skipping');
                return false;
            }
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
            });
            data = await res.json();
        }

        if (data.success || data.id) {
            console.log('[email] ✅ Sent:', data.id);
            return true;
        }
        console.warn('[email] ❌ Failed:', JSON.stringify(data));
        return false;
    } catch (err) {
        console.error('[email] ❌ Error:', err);
        return false;
    }
}

// ────────────────────────────────────────────
// Branded HTML template
// ────────────────────────────────────────────

function wrapInTemplate(title: string, body: string, ctaText?: string, ctaUrl?: string): string {
    const cta = ctaText && ctaUrl
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
             <tr>
               <td style="background:#38b4ba;border-radius:8px;padding:14px 32px;">
                 <a href="${ctaUrl}" style="color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;display:inline-block;">
                   ${ctaText}
                 </a>
               </td>
             </tr>
           </table>`
        : '';

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#030711;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#030711;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          <!-- Header -->
          <tr>
            <td style="text-align:center;padding-bottom:32px;">
              <span style="font-size:28px;font-weight:800;color:#38b4ba;letter-spacing:-0.5px;">MU6</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:#0f1724;border-radius:16px;padding:36px 32px;border:1px solid rgba(255,255,255,0.06);">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;">${title}</h1>
              <div style="font-size:15px;line-height:1.6;color:#94a3b8;">${body}</div>
              ${cta}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="text-align:center;padding-top:32px;">
              <p style="margin:0;font-size:12px;color:#475569;">MU6 — The Future of Music</p>
              <p style="margin:6px 0 0;font-size:11px;color:#334155;">You're receiving this because you have an account on MU6.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ────────────────────────────────────────────
// Email event functions
// ────────────────────────────────────────────

/** Split sheet invitation for unregistered collaborator */
export async function sendSplitInviteEmail(
    to: string,
    inviterName: string,
    songTitle: string,
    role: string,
    sharePercent: number,
): Promise<boolean> {
    const subject = "🎵 You've been added to a royalty split on MU6";
    const body = `<p><strong>${inviterName}</strong> added you as a <strong>${role}</strong> on "<strong>${songTitle}</strong>" with a <strong>${sharePercent}%</strong> royalty share.</p>
<p>Sign up on MU6 to claim your earnings.</p>`;
    const html = wrapInTemplate("You've Been Added to a Split", body, 'Claim Your Royalty Share', 'https://mu6.app');
    return sendEmail(to, subject, html);
}

/** Royalty payout processed/credited */
export async function sendRoyaltyPayoutEmail(
    to: string,
    amount: string,
    songTitle: string,
    balance: string,
): Promise<boolean> {
    const subject = `💰 Royalty payment received — ${amount} POL`;
    const body = `<p>You earned <strong>${amount} POL</strong> from streams of "<strong>${songTitle}</strong>".</p>
<p>Your total balance is now <strong>${balance} POL</strong>.</p>`;
    const html = wrapInTemplate('Royalty Payment Received', body, 'View Earnings', 'https://mu6.app/earnings');
    return sendEmail(to, subject, html);
}

/** NFT purchased — notification to song creator */
export async function sendNftMintedEmail(
    to: string,
    songTitle: string,
    tierName: string,
    price: string,
    mintedCount: number,
    totalSupply: number,
): Promise<boolean> {
    const subject = '🎉 Your NFT was purchased!';
    const body = `<p>Someone just minted a <strong>${tierName}</strong> NFT of "<strong>${songTitle}</strong>" for <strong>${price} POL</strong>.</p>
<p>${mintedCount}/${totalSupply} minted.</p>`;
    const html = wrapInTemplate('Your NFT Was Purchased!', body, 'View NFT Manager', 'https://mu6.app/nft-manager');
    return sendEmail(to, subject, html);
}

/** NFT purchase confirmation — to buyer */
export async function sendNftPurchaseConfirmEmail(
    to: string,
    songTitle: string,
    artistName: string,
    tierName: string,
    royaltyPercent: string,
): Promise<boolean> {
    const subject = '🎵 NFT Purchase Confirmed';
    const body = `<p>You now own a <strong>${tierName}</strong> NFT of "<strong>${songTitle}</strong>" by <strong>${artistName}</strong>.</p>
<p>This entitles you to a <strong>${royaltyPercent}%</strong> royalty share.</p>`;
    const html = wrapInTemplate('NFT Purchase Confirmed', body, 'View My NFTs', 'https://mu6.app/library');
    return sendEmail(to, subject, html);
}

/** Song published notification */
export async function sendSongPublishedEmail(
    to: string,
    songTitle: string,
): Promise<boolean> {
    const subject = '✅ Your song is live on MU6!';
    const body = `<p>"<strong>${songTitle}</strong>" is now available for streaming on MU6.</p>
<p>Share it with your fans!</p>`;
    const html = wrapInTemplate('Your Song Is Live!', body, 'View Your Song', 'https://mu6.app');
    return sendEmail(to, subject, html);
}

/** Stream milestone notification */
export async function sendStreamMilestoneEmail(
    to: string,
    songTitle: string,
    milestone: number,
): Promise<boolean> {
    const subject = `🔥 ${songTitle} just hit ${milestone.toLocaleString()} streams!`;
    const body = `<p>Congratulations! "<strong>${songTitle}</strong>" has reached <strong>${milestone.toLocaleString()}</strong> streams on MU6.</p>
<p>Keep the momentum going!</p>`;
    const html = wrapInTemplate(`${milestone.toLocaleString()} Streams!`, body, 'View Stats', 'https://mu6.app/dashboard');
    return sendEmail(to, subject, html);
}

/** Verification status update */
export async function sendVerificationStatusEmail(
    to: string,
    isVerified: boolean,
): Promise<boolean> {
    const subject = isVerified
        ? "✅ You're now a Verified Artist on MU6"
        : 'Verification status updated on MU6';
    const body = isVerified
        ? `<p>Congratulations! Your artist profile has been <strong>verified</strong> on MU6.</p>
<p>You now have a verified badge on your profile, increased visibility, and access to premium features.</p>`
        : `<p>Your verification status on MU6 has been updated.</p>
<p>Your verified badge has been removed. If you believe this was a mistake, please contact support.</p>`;
    const html = wrapInTemplate(
        isVerified ? "You're Verified!" : 'Verification Status Updated',
        body,
        'View Profile',
        'https://mu6.app/settings',
    );
    return sendEmail(to, subject, html);
}

/** Split auto-linked notification (sent when a new user registers and has pending invitations) */
export async function sendSplitAutoLinkedEmail(
    to: string,
    songTitle: string,
    role: string,
    sharePercent: number,
): Promise<boolean> {
    const subject = '🎵 Your royalty split has been activated!';
    const body = `<p>Your account has been linked to a royalty split on "<strong>${songTitle}</strong>".</p>
<p>You are listed as <strong>${role}</strong> with a <strong>${sharePercent}%</strong> share. Earnings will now be credited to your account.</p>`;
    const html = wrapInTemplate('Split Activated!', body, 'View Earnings', 'https://mu6.app/earnings');
    return sendEmail(to, subject, html);
}
