# InvoicePro — AI-Powered Automated Invoice & Payment Automation Platform 🧾⚡

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-v19-61dafb.svg)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-brightgreen.svg)](https://www.mongodb.com/cloud/atlas)
[![Gemini AI](https://img.shields.io/badge/Google_Gemini-Vision_OCR-orange.svg)](https://ai.google.dev/)

An enterprise-grade, full-stack B2B billing and payment automation SaaS. Designed with a sleek, responsive interface inspired by Stripe and Linear, featuring AI handwritten OCR, zero-cost WhatsApp dispatching, client payment portals, and revenue forecasting.

---

## 🌟 Key Features

### 1. 🤖 AI-Powered OCR (Google Gemini Vision)
- Upload photos or scans of handwritten or printed invoices/receipts.
- Extracts client details, line items, quantities, and prices automatically using **Google Gemini Vision**.
- Includes automatic fallback to Tesseract.js with Sharp image enhancement.

### 2. 🔐 Authentication & Multi-Tenancy
- **Google OAuth 2.0**: One-click Sign in with Google.
- **JWT & Email/Password**: Secure bcrypt-hashed authentication.
- Multi-user isolation: Invoices, settings, and WhatsApp connections are tied to each authenticated merchant.

### 3. 📱 Free Multi-Tenant WhatsApp & Email Automation
- Instant QR-code connection directly from the dashboard using `whatsapp-web.js` (No paid Twilio API needed).
- Automatically sends invoices, payment links, and generated PDF attachments via WhatsApp and Email upon creation.
- Includes quick **"📱 Send"** action to re-dispatch invoices to clients anytime.

### 4. 💳 Razorpay Integrated Payment Portal (`/pay/:invoiceId`)
- Dedicated, secure client-facing payment link.
- Seamless Razorpay checkout with instant verification and automatic status transition to **PAID**.
- Dynamic generation of timestamped PDF receipts stamped **"✓ PAID"**.

### 5. 📊 Analytics & Default Risk Predictor
- **Revenue Analytics**: Monthly revenue trends, paid vs. pending comparisons, and 6-month historical tracking.
- **AI Cash Flow Forecasting**: Predictive linear regression model for next-month receivables.
- **Risk Assessment**: Classifies default risk (Low / Medium / High) based on invoice amount and historical payer behavior.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, Vite, React Router DOM v7, Recharts, Lucide Icons, Vanilla CSS Design System |
| **Backend** | Node.js, Express, MongoDB (Mongoose), Socket.IO, Passport.js, JWT, Bcrypt |
| **Integrations** | Google Gemini GenAI SDK, Razorpay, WhatsApp Web.js + Puppeteer, Nodemailer, PDFKit |
| **Deployment** | Docker, Render, Vercel |

---

## 🚀 Quick Start Guide (Local Setup)

### 1. Prerequisites
- **Node.js**: v18 or higher
- **MongoDB**: Local MongoDB instance or free [MongoDB Atlas Cluster](https://www.mongodb.com/cloud/atlas)
- **Google AI Studio API Key**: [Get a free Gemini API key](https://aistudio.google.com/app/apikey)
- **Razorpay Account**: [Razorpay Dashboard](https://dashboard.razorpay.com/) (Test mode)

### 2. Clone Repository & Install Dependencies

```bash
git clone https://github.com/Ayusman23/automated-invoice-generator.git
cd automated-invoice-generator

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 3. Configure Environment Variables

In `backend/`, copy `.env.example` to `.env`:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with your credentials:

```env
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/invoicedb?retryWrites=true&w=majority
FRONTEND_URL=http://localhost:5173

# Auth & Sessions
JWT_SECRET=your_jwt_secret_key
SESSION_SECRET=your_session_secret_key

# Google OAuth 2.0
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Gmail SMTP Fallback
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_16_character_app_password

# Razorpay
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxx
RAZORPAY_KEY_SECRET=your_razorpay_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# Google Gemini Vision OCR
GEMINI_API_KEY=your_gemini_api_key
```

### 4. Run the Application

**Terminal 1 — Backend:**
```bash
cd backend
node server.js
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Visit **`http://localhost:5173`** to access the application.

---

## 🐳 Docker & Render Deployment Guide

### Deploying the Backend on Render

1. **Create a Web Service on Render**:
   - Select **Docker** environment.
   - **Root Directory**: `backend` (or leave empty if using root Dockerfile).
   - **Dockerfile Path**: `Dockerfile`

2. **Set Environment Variables in Render Dashboard**:
   Go to your Render Web Service $\rightarrow$ **Environment** $\rightarrow$ **Add Environment Variable**:

   | Key | Value | Notes |
   |---|---|---|
   | `MONGO_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/invoicedb?retryWrites=true&w=majority` | Ensure Atlas allows `0.0.0.0/0` |
   | `FRONTEND_URL` | `https://your-frontend-domain.vercel.app` | Production frontend URL |
   | `JWT_SECRET` | `your_secure_random_string` | Minimum 32 characters |
   | `SESSION_SECRET` | `your_secure_random_string` | |
   | `GOOGLE_CLIENT_ID` | `your_google_client_id` | Add Render domain to Authorized Redirect URIs |
   | `GOOGLE_CLIENT_SECRET` | `your_google_client_secret` | |
   | `GMAIL_USER` | `your_email@gmail.com` | |
   | `GMAIL_APP_PASSWORD` | `your_app_password` | |
   | `RAZORPAY_KEY_ID` | `rzp_live_xxx` or `rzp_test_xxx` | |
   | `RAZORPAY_KEY_SECRET` | `your_razorpay_secret` | |
   | `GEMINI_API_KEY` | `your_gemini_api_key` | |

3. **MongoDB Atlas Network Access (Critical for Render)**:
   - In MongoDB Atlas, navigate to **Security** $\rightarrow$ **Network Access**.
   - Click **Add IP Address** $\rightarrow$ select **Allow Access from Anywhere (`0.0.0.0/0`)**.
   - Ensure the database user username and password match your `MONGO_URI`.

---

## 📄 License
This project is licensed under the ISC License.
