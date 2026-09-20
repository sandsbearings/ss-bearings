import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

export async function sendEmail({ to, subject, html }) {
  await transporter.sendMail({ from: process.env.GMAIL_USER, to, subject, html });
}
