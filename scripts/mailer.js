const nodemailer = require('nodemailer');

async function sendEmail(subject, content) {
  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_TO,
    subject,
    text: content
  });

  console.log('📧 이메일 전송 완료!');
}

module.exports = { sendEmail };
