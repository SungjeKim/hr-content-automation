require('dotenv').config();

const nodemailer = require('nodemailer');
const fs = require('fs');

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: 'sungjkim6108@gmail.com', 
    pass: 'zonlysqnlofytsod',
  },
});

const message = '📢 HR 콘텐츠 자동화 테스트 메일입니다.\n\n로그가 아닌 테스트 메시지입니다.';

const mailOptions = {
  from: 'sungjkim6108@gmail.com',
  to: 'sungjkim6108@gmail.com',
  subject: '🧪 [테스트] HR 자동화 메일',
  text: '이건 .env 파일을 통해 보안 강화한 이메일입니다!',
};

transporter.sendMail(mailOptions, (err, info) => {
  if (err) {
    console.error('❌ 메일 전송 실패:', err);
  } else {
    console.log('✅ 메일 전송 완료:', info.response);
  }
});
