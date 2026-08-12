# Automated Invoice Generator 🧾✨

An enterprise-grade, full-stack B2B Automated Invoice Generator built with React and Node.js. Designed to streamline the billing process with AI-powered handwriting recognition, real-time risk prediction, and automated multi-channel payment receipts.

---

## 🌟 Key Features

### 1. 🤖 AI-Powered OCR (Google Gemini Vision)
Upload photos of handwritten invoices, and the system perfectly extracts client details, items, prices, and quantities into a strict JSON structure using the cutting-edge **Google Gemini 3.5 Flash** vision model, automatically populating the invoice form. 
- *Fallback support for typed text via Tesseract.js & Sharp preprocessing.*

### 2. 💳 Integrated Payment Gateway (Razorpay)
Dedicated client-facing payment portal (`/pay/:invoiceId`) allowing clients to pay securely. Webhooks (`payment.captured`) automatically update the invoice status in the database to **PAID** the second a transaction clears.

### 3. 📱 100% Free WhatsApp & Email Automation
The moment a client pays via the payment link:
- A beautifully formatted PDF receipt is generated with a dynamic **"✓ PAID"** stamp.
- An email receipt is instantly dispatched via Nodemailer.
- A WhatsApp message is sent instantly using a headless Chrome instance (`whatsapp-web.js`), attaching the final PDF receipt — all for free without relying on expensive Twilio APIs.

### 4. 📊 Analytics & Risk Prediction Dashboard
- **Revenue Analytics**: Visual breakdown of total, paid, and pending revenues with 6-month historical tracking and AI-powered linear regression predicting next month's cash flow.
- **Risk Predictor**: Predicts the likelihood of payment default (Low, Medium, High Risk) based on invoice value and historical client behavior to help you manage credit control.

### 5. 🎨 Enterprise UI/UX
Designed with a sleek, light-mode B2B SaaS aesthetic (inspired by Stripe and Zoho). Includes soft shadows, smooth transitions, responsive tables, and elegant status badges.

---

## 🛠️ Technology Stack

**Frontend:**
- React 19 + Vite
- React Router DOM v7 (Multi-route architecture)
- Recharts (Analytics visualization)
- Vanilla CSS (Custom Enterprise Design System)

**Backend:**
- Node.js + Express
- MongoDB (Mongoose)
- Razorpay API (Payments & Webhooks)
- Google GenAI SDK (Gemini Vision OCR)
- `whatsapp-web.js` + Puppeteer (Free WhatsApp messaging)
- `pdfkit` (Dynamic PDF generation)

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Node.js (v18+)
- MongoDB running locally or via MongoDB Atlas
- API Keys: Razorpay, Google Gemini (Free tier)
- Gmail account with an App Password

### 2. Installation
Clone the repository and install dependencies for both the frontend and backend.

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 3. Environment Variables
Create a `.env` file in the `backend/` directory with the following variables:

```env
MONGO_URI=mongodb://localhost:27017/invoiceapp
FRONTEND_URL=http://localhost:5173

# Gmail 
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_16_char_app_password

# Razorpay
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# Google Gemini Vision OCR 
GEMINI_API_KEY=your_gemini_api_key
```

### 4. Running the Application
You need to run both the frontend and backend servers.

**Terminal 1 (Backend):**
```bash
cd backend
node server.js
```
*Note: On the first run, a WhatsApp QR code will appear in the terminal. Scan it with your phone to link your WhatsApp account for automated messages.*

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

### 5. Usage
1. Open the Admin Dashboard at `http://localhost:5173/admin`
2. Create an invoice manually or upload a handwritten note via the OCR scanner.
3. The invoice is generated and the client receives an email + WhatsApp with the PDF.
4. The client clicks the link in the PDF/Message, goes to `/pay/:invoiceId`, and pays.
5. The Razorpay webhook updates the status, and a final PAID receipt is sent!

---

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

## 📝 License
This project is licensed under the ISC License.
