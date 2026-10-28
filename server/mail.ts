// Transactional email. Resend's HTTP API is used (plain fetch, no SDK).
//   RESEND_API_KEY + EMAIL_FROM  -> real delivery; email verification is ENFORCED
//   EMAIL_VERIFICATION=console   -> prints the email (and link) to the server log; verification enforced (local dev)
//   EMAIL_VERIFICATION=memory    -> keeps emails in `outbox` (tests)
//   nothing set                  -> verification is OFF and new accounts are auto-verified, so a deployment without
//                                   an email provider keeps working instead of locking everybody out.

export type MailMode = 'resend' | 'console' | 'memory' | 'off';

export function mailMode(): MailMode {
  const m = process.env.EMAIL_VERIFICATION;
  if (m === 'console' || m === 'memory') return m;
  if (process.env.RESEND_API_KEY) return 'resend';
  return 'off';
}

export const verificationEnabled = () => mailMode() !== 'off';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export const outbox: Mail[] = [];

export async function sendMail(mail: Mail): Promise<boolean> {
  const mode = mailMode();
  if (mode === 'memory') {
    outbox.push(mail);
    return true;
  }
  if (mode === 'console') {
    console.log(`\n[mail] to=${mail.to}\n[mail] subject=${mail.subject}\n${mail.text}\n`);
    return true;
  }
  if (mode === 'off') return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || 'Khondo <onboarding@resend.dev>', to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) console.error('[mail] provider error', res.status, await res.text().catch(() => ''));
    return res.ok;
  } catch (e) {
    console.error('[mail] send failed', e);
    return false;
  }
}

export type MailLang = 'en' | 'th' | 'zh';

const COPY: Record<MailLang, { subject: string; hi: (n: string) => string; body: string; button: string; expiry: string; ignore: string }> = {
  en: {
    subject: 'Verify your email for Khondo',
    hi: (n) => `Hi ${n},`,
    body: 'Thanks for joining Khondo. Please confirm your email address to activate your account.',
    button: 'Verify my email',
    expiry: 'This link expires in 24 hours and can be used once.',
    ignore: 'If you did not create a Khondo account you can safely ignore this email.',
  },
  th: {
    subject: 'ยืนยันอีเมลของคุณสำหรับ Khondo',
    hi: (n) => `สวัสดี ${n}`,
    body: 'ขอบคุณที่สมัครใช้งาน Khondo กรุณายืนยันที่อยู่อีเมลเพื่อเปิดใช้งานบัญชีของคุณ',
    button: 'ยืนยันอีเมลของฉัน',
    expiry: 'ลิงก์นี้หมดอายุใน 24 ชั่วโมงและใช้ได้ครั้งเดียว',
    ignore: 'หากคุณไม่ได้สร้างบัญชี Khondo โปรดละเว้นอีเมลฉบับนี้',
  },
  zh: {
    subject: '请验证您的 Khondo 邮箱',
    hi: (n) => `${n}，您好：`,
    body: '感谢加入 Khondo。请确认您的邮箱地址以激活账号。',
    button: '验证我的邮箱',
    expiry: '此链接 24 小时内有效，且只能使用一次。',
    ignore: '如果您没有创建 Khondo 账号，请忽略此邮件。',
  },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function verificationMail(to: string, name: string, link: string, lang: MailLang): Mail {
  const c = COPY[lang] ?? COPY.en;
  const who = name.trim() || to;
  return {
    to,
    subject: c.subject,
    text: `${c.hi(who)}\n\n${c.body}\n\n${link}\n\n${c.expiry}\n${c.ignore}\n`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1c1917">
<h2 style="margin:0 0 16px;color:#0f766e">Khondo</h2>
<p>${esc(c.hi(who))}</p><p>${esc(c.body)}</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#0f766e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block">${esc(c.button)}</a></p>
<p style="font-size:13px;color:#57534e">${esc(c.expiry)}<br>${esc(c.ignore)}</p>
<p style="font-size:12px;color:#a8a29e;word-break:break-all">${esc(link)}</p></div>`,
  };
}
