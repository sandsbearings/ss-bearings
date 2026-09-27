import nodemailer from "nodemailer";
import { company } from "../config/company.js";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  // Some hosts (e.g. Render) can't route to Gmail's IPv6 SMTP address and fail with
  // ENETUNREACH; forcing IPv4 avoids that.
  family: 4,
});

// Sent from the shop's name (not a bare address), with a plain-text copy alongside the HTML —
// both make it less likely to land in spam.
export async function sendEmail({ to, subject, html, text }) {
  await transporter.sendMail({
    from: { name: company.name, address: process.env.GMAIL_USER },
    to,
    subject,
    html,
    text,
  });
}
