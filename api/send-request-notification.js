export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const operatorEmail = process.env.OPERATOR_NOTIFICATION_EMAIL;

  if (!apiKey || !fromEmail || !operatorEmail) {
    return response.status(503).json({
      error: "Automated email is not configured yet. Add RESEND_API_KEY, RESEND_FROM_EMAIL, and OPERATOR_NOTIFICATION_EMAIL in Vercel.",
    });
  }

  const requestId = String(request.body?.requestId || "").trim();
  const subject = String(request.body?.subject || "").trim();
  const summary = String(request.body?.summary || "").trim();

  if (!requestId || !subject || !summary) {
    return response.status(400).json({
      error: "Request id, subject, and summary are required.",
    });
  }

  try {
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": requestId,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [operatorEmail],
        subject,
        text: summary,
        html: createEmailHtml(summary),
      }),
    });

    const payload = await resendResponse.json();

    if (!resendResponse.ok) {
      return response.status(resendResponse.status).json({
        error: payload.message || payload.error || "Resend could not send the operator notification.",
      });
    }

    return response.status(200).json({
      id: payload.id || null,
    });
  } catch (error) {
    return response.status(500).json({
      error: "The automated operator email is temporarily unavailable.",
    });
  }
}

function createEmailHtml(summary) {
  const paragraphs = summary
    .split("\n")
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 10px;">${escapeHtml(line)}</p>`)
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;background:#f7f3ee;padding:24px;color:#18231f;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:20px;padding:28px;border:1px solid rgba(24,35,31,0.08);">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0a7e77;font-weight:700;">On The Move</p>
        <h1 style="margin:0 0 18px;font-size:28px;line-height:1.1;">New move request received</h1>
        <div style="font-size:15px;line-height:1.6;color:#40504b;">
          ${paragraphs}
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
