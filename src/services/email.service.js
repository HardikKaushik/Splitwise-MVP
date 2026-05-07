import nodemailer from "nodemailer";

let transporter;

const emailService = {
  init: async () => {
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      // Use Ethereal (test) account when no SMTP creds configured
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      console.log("[EMAIL] Using Ethereal test account:", testAccount.user);
    }
    console.log("[EMAIL] Email service initialized");
  },

  sendMonthlyBalanceReport: async ({ to, name, balances, month }) => {
    if (!transporter) await emailService.init();

    const balanceLines = balances
      .map((b) => {
        if (b.net > 0) return `  • ${b.otherUser} owes you ${b.currency} ${b.net.toFixed(2)}`;
        if (b.net < 0) return `  • You owe ${b.otherUser} ${b.currency} ${Math.abs(b.net).toFixed(2)}`;
        return `  • Settled up with ${b.otherUser}`;
      })
      .join("\n");

    const html = `
      <h2>Splitwise Monthly Balance Report — ${month}</h2>
      <p>Hi ${name},</p>
      <p>Here's a summary of your balances for <strong>${month}</strong>:</p>
      <pre>${balanceLines || "  No activity this month."}</pre>
      <p>Log in to Splitwise to settle up!</p>
    `;

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || "splitwise@example.com",
      to,
      subject: `Splitwise Balance Report — ${month}`,
      html,
    });

    console.log("[EMAIL] Message sent:", info.messageId);
    // Preview URL only available when using Ethereal
    const previewUrl = nodemailer.getTestMessageUrl(info);
    return { messageId: info.messageId, previewUrl };
  },
};

export default emailService;
