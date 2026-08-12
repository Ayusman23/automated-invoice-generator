require('dotenv').config({ path: 'backend/.env' });
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN, { accountSid: process.env.TWILIO_ACCOUNT_SID_MAIN });
client.messages.create({
  from: process.env.TWILIO_WHATSAPP_FROM,
  to: 'whatsapp:+918328943690',
  body: 'Hello from test script!'
}).then(msg => console.log('Success:', msg.sid))
  .catch(err => console.error('Error:', err.message, err.code));
