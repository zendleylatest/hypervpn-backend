const nodemailer = require("nodemailer");

const APP_NAME = "Secure VPN";

function senderAddress(user) {
  return `"${APP_NAME}" <${user}>`;
}

function otpEmailHtml(otp) {
  return `
  <div style="margin:0;padding:0;background:#f3f7fb;font-family:Arial,Helvetica,sans-serif;color:#102033;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f7fb;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #dfe8f2;">
            <tr>
              <td style="padding:28px 28px 20px;background:linear-gradient(135deg,#1757c2,#65d9cf);color:#ffffff;">
                <div style="font-size:22px;font-weight:800;letter-spacing:.2px;">${APP_NAME}</div>
                <div style="font-size:14px;opacity:.92;margin-top:6px;">Verify your email to continue</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px;">
                <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#102033;">Your verification code</h1>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#526173;">Use this code to finish signing in to Secure VPN.</p>
                <div style="background:#eef6ff;border:1px solid #cfe2ff;border-radius:16px;padding:18px;text-align:center;">
                  <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#1757c2;">${otp}</div>
                </div>
                <p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#6a7788;">If you did not request this code, you can safely ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
}

async function sendOTPEmail(email, otp) {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) {
    console.warn(
      `[hyper-vpn] OTP not emailed (set EMAIL_USER + EMAIL_PASS in .env). OTP for ${email}: ${otp}`
    );
    return;
  }
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass,
    },
  });

  await transporter.sendMail({
    from: senderAddress(user),
    to: email,
    subject: `${APP_NAME} verification code`,
    text: `Your ${APP_NAME} verification code is: ${otp}`,
    html: otpEmailHtml(otp),
  });
}

async function sendEmail(email, subject, text) {
  if (!email || !subject || !text) {
    console.error("sendEmail: missing email, subject, or text");
    return;
  }

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) {
    console.warn(
      `[hyper-vpn] Email skipped (set EMAIL_USER + EMAIL_PASS). To: ${email} | ${subject} | ${text}`
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: senderAddress(user),
    to: email,
    subject,
    text,
  });
}

module.exports = { sendOTPEmail, sendEmail };
