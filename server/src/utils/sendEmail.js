import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  // Some hosts (e.g. Render) can't route to Gmail's IPv6 SMTP address and fail with
  // ENETUNREACH; forcing IPv4 avoids that.
  family: 4,
});

export async function sendEmail({ to, subject, html }) {
  await transporter.sendMail({ from: process.env.GMAIL_USER, to, subject, html });
}
