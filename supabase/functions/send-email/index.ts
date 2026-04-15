import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import nodemailer from 'npm:nodemailer@6.9.12';

const GMAIL_USER = Deno.env.get('GMAIL_USER') || '';
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') || '';
const FROM_ADDRESS = `MU6 Music <${GMAIL_USER}>`;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
    },
});

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { to, subject, html } = await req.json();

        if (!to || !subject || !html) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: to, subject, html' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
            return new Response(
                JSON.stringify({ error: 'Gmail SMTP credentials not configured in edge function secrets' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        console.log('[send-email] Sending to:', to, '| Subject:', subject);

        const info = await transporter.sendMail({
            from: FROM_ADDRESS,
            to,
            subject,
            html,
        });

        console.log('[send-email] ✅ Sent:', info.messageId);
        return new Response(
            JSON.stringify({ success: true, id: info.messageId }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    } catch (err: any) {
        console.error('[send-email] ❌ Error:', err);
        return new Response(
            JSON.stringify({ error: err.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
});
