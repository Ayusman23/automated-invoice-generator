# InvoicePro — AI-Powered Automated Invoice & Payment Automation Platform 🧾⚡

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-v19-61dafb.svg)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-brightgreen.svg)](https://www.mongodb.com/cloud/atlas)
[![Gemini AI](https://img.shields.io/badge/Google_Gemini-Vision_OCR-orange.svg)](https://ai.google.dev/)
[![Baileys](https://img.shields.io/badge/WhatsApp-Baileys_WS-25D366.svg)](https://github.com/WhiskeySockets/Baileys)
[![Razorpay](https://img.shields.io/badge/Payments-Razorpay_HMAC-0C2340.svg)](https://razorpay.com/)

An enterprise-grade, full-stack B2B billing, invoicing, and payment automation SaaS platform. Designed with a sleek editorial interface inspired by Stripe and Linear, featuring Google Gemini Vision handwritten OCR, ultra-lightweight zero-cost WhatsApp WebSockets automation, dedicated client payment portals, and predictive revenue forecasting.

---

## 📸 Visual Walkthrough & System Screenshots

### 1. 🌟 Public Experience & Multi-Tenant Onboarding

#### Landing Page
> Editorial, high-conversion landing page featuring a live interactive invoice document preview, trust indicators, feature cards, and FAQ accordions.

![Landing Page](./Assets/Landing%20Page.png)

<br>

#### Multi-Tenant Authentication (Sign Up & Sign In)
> Secure user onboarding supporting 1-click Google OAuth 2.0 and bcrypt-hashed password authentication with JWT session persistence.

| Sign Up Portal | Sign In Portal |
|:---:|:---:|
| ![Sign Up](./Assets/Signup.png) | ![Sign In](./Assets/Login.png) |

---

### 2. 📊 Interactive Invoice Builder & Financial Command Center

#### Workspace & Analytics Dashboard
> Complete enterprise dashboard combining dynamic invoice creation (line items, GSTIN, real-time tax calculation, Gemini Vision OCR photo upload) and financial intelligence (monthly revenue trends, cash flow forecasting, default risk predictor, and invoice management).

![Invoice Generator Form and Analytics Dashboard](./Assets/Invoice%20Generator%20form%20and%20analytics%20dash%20board.png)

---

### 3. 📱 Ultra-Lightweight WhatsApp Automation Gateway

#### Baileys Direct WebSocket QR Pairing
> Embedded WhatsApp pairing interface powered by `@whiskeysockets/baileys` direct WebSockets. Operates with zero headless browser overhead (<15MB RAM) for 24/7 cloud dispatch of PDF invoices, reminders, and payment receipts.

![WhatsApp Linking Scanner](./Assets/Whatsapp%20Linking%20Scanner.png)

---

### 4. 📬 Automated Multi-Channel Customer Invoice Dispatch

#### Email & PDF Invoice Delivery
> Invoices are formatted and dispatched automatically with embedded payment links, itemized breakdowns, and print-ready branded PDF attachments.

| Customer Email Notification | Official PDF Invoice Document |
|:---:|:---:|
| ![Payment Link Email](./Assets/Payment%20Link%20Sent%20to%20the%20customer%20email.png) | ![Official PDF Invoice](./Assets/Payment%20Invoice.png) |

---

### 5. 💳 Dedicated Client Payment Portal & Razorpay Checkout

#### Client Payment Portal (`/pay/:invoiceId`)
> Standalone, responsive payment portal where clients review line items, tax breakdowns, and proceed to checkout with a single click.

![Client Payment Portal](./Assets/Payment%20page.png)

<br>

#### Razorpay Modal & Cryptographic Verification
> Secure checkout supporting UPI (Google Pay, PhonePe, Paytm), Netbanking, and Credit/Debit cards with HMAC SHA-256 signature verification.

| Razorpay Payment Modal | Payment Success Confirmation |
|:---:|:---:|
| ![Razorpay Modal](./Assets/Rozer%20Pay%20Payment%20Page.png) | ![Payment Success Verification](./Assets/Rozer%20Pay%20Payment%20Succces%20Page.png) |

---

### 6. ✅ Post-Payment Confirmations & Multi-Channel Receipts

#### Instant In-Portal Settlement & Official "✓ PAID" Receipt
> Immediate post-payment settlement screen with one-click download of the timestamped PDF receipt stamped with the official green **"✓ PAID"** seal.

| In-Portal Success Confirmation | Official Timestamped Paid Receipt |
|:---:|:---:|
| ![Payment Success Message](./Assets/Payment%20Succes%20Message.png) | ![Payment Success Invoice](./Assets/Payment%20Succes%20Invoice.png) |

<br>

#### Automated Post-Payment Notifications (WhatsApp & Email)
> Automated notifications dispatched to the customer's WhatsApp and Email confirming settlement and delivering the final receipt.

| WhatsApp Payment Receipt | Email Payment Confirmation |
|:---:|:---:|
| ![WhatsApp Confirmation](./Assets/Payment%20Succes%20Whatsapp%20Message.png) | ![Email Confirmation](./Assets/Payment%20Succes%20Msg%20Sent%20On%20email.png) |

---

## 🌟 Core Architecture & Key Features

### 1. 🤖 AI-Powered OCR (Google Gemini Vision)
- Upload photos or scans of handwritten or printed invoices/receipts.
- Extracts client details, line items, quantities, and prices automatically using **Google Gemini Vision**.
- Automatic pre-compression and strict JSON schema extraction for instant parsing with zero server RAM overhead.

### 2. 🔐 Authentication & Multi-Tenancy
- **Google OAuth 2.0**: Clean 1-click Sign in with Google (standard non-sensitive `profile` and `email` scopes).
- **JWT & Email/Password**: Secure bcrypt-hashed authentication (10 salt rounds).
- Multi-tenant data isolation: Invoices, settings, and WhatsApp connections are partitioned by `userId`.

### 3. 📱 Ultra-Lightweight WhatsApp & Email Automation (Baileys WebSockets)
- Instant QR-code connection directly from the dashboard using **`@whiskeysockets/baileys`** pure WebSockets (Only ~15MB RAM, no headless browser needed).
- Automatically dispatches branded PDF invoices, payment links, and receipts via WhatsApp and Email upon creation.
- Includes quick **"📱 Send"** action to re-dispatch invoices to clients anytime.

### 4. 💳 Razorpay Integrated Payment Portal (`/pay/:invoiceId`)
- Dedicated, secure client-facing payment portal with HMAC SHA-256 webhook and client-side signature verification.
- Seamless Razorpay checkout with instant verification and automatic status transition to **PAID**.
- Dynamic generation of timestamped PDF receipts stamped **"✓ PAID"**.

### 5. 📊 Analytics & Default Risk Predictor
- **Revenue Analytics**: Monthly revenue trends, paid vs. pending comparisons, and 6-month historical tracking.
- **AI Cash Flow Forecasting**: Predictive linear regression model for next-month receivables.
- **Risk Assessment**: Classifies default risk (Low / Medium / High) based on invoice amount and historical payer behavior.

---

## 🛡️ Security Architecture

- **Razorpay Webhook Signature Verification**: All incoming webhooks on `/api/payment/webhook` are cryptographically verified using HMAC SHA-256 (`crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)`) against the raw incoming binary payload before JSON parsing, preventing payload tampering, forged payment events, and replay attacks.
- **Rate Limiting (`express-rate-limit`)**: Public-facing API endpoints are protected against brute-force and DDoS attacks:
  - **Global API Limiter**: Capped at 250 requests per 15-minute window.
  - **Auth Routes (`/api/auth/login`, `/api/auth/signup`)**: Restricted to 30 attempts per 15 minutes.
  - **Invoice Creation (`POST /api/invoices`)**: Throttled to 50 requests per 10 minutes.
  - **Payment Endpoints (`/api/payment/*`)**: Limited to 60 requests per minute.
- **Input Validation**: API endpoints enforce strict schema validation (regex email validation, non-negative numerical pricing, sanitization of client names) to prevent injection and malformed document writes.
- **WhatsApp Architecture**: Uses `@whiskeysockets/baileys` direct WebSocket implementation, consuming under 20MB of RAM and ensuring reliable 24/7 uptime even on low-memory cloud instances (e.g. Render 512MB free tier).

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, Vite, React Router DOM v7, Recharts, Lucide Icons, Vanilla CSS Design System |
| **Backend** | Node.js, Express, MongoDB (Mongoose), Socket.IO, Passport.js, JWT, Bcrypt, express-rate-limit |
| **Integrations** | Google Gemini GenAI SDK, Razorpay, Baileys WebSocket WhatsApp, Nodemailer, PDFKit, Sharp |
| **Deployment** | Docker, Render, Vercel |

---

## 🚀 Quick Start Guide (Local Setup)

### 1. Prerequisites
* **Node.js**: v18 or higher
* **MongoDB**: Local MongoDB instance or free [MongoDB Atlas Cluster](https://www.mongodb.com/cloud/atlas)
* **Google AI Studio API Key**: [Get a free Gemini API key](https://aistudio.google.com/app/apikey)
* **Razorpay Account**: [Razorpay Dashboard](https://dashboard.razorpay.com/) (Test mode)

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

# Razorpay (Use test keys ONLY — never commit live keys)
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

Visit **`http://localhost:5173`** in your browser.

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
   | `MONGO_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/invoicedb?retryWrites=true&w=majority` | MongoDB connection string |
   | `FRONTEND_URL` | `https://your-frontend-domain.vercel.app` | Production frontend URL |
   | `JWT_SECRET` | `your_secure_random_string` | Minimum 32 characters |
   | `SESSION_SECRET` | `your_secure_random_string` | |
   | `GOOGLE_CLIENT_ID` | `your_google_client_id` | Add Render domain to Authorized Redirect URIs |
   | `GOOGLE_CLIENT_SECRET` | `your_google_client_secret` | |
   | `GMAIL_USER` | `your_email@gmail.com` | |
   | `GMAIL_APP_PASSWORD` | `your_app_password` | |
   | `RAZORPAY_KEY_ID` | `rzp_test_xxxxxxxxx` | Test-mode key (never commit live keys) |
   | `RAZORPAY_KEY_SECRET` | `your_razorpay_secret` | |
   | `RAZORPAY_WEBHOOK_SECRET` | `your_webhook_secret` | |
   | `GEMINI_API_KEY` | `your_gemini_api_key` | |

3. **MongoDB Atlas Network Access (Critical for Render)**:
   - In MongoDB Atlas navigate to **Security** $\rightarrow$ **Network Access** $\rightarrow$ **Add IP Address** $\rightarrow$ add Render's outbound static IPs (or `0.0.0.0/0` for initial testing).

---

## 📄 License
This project is licensed under the ISC License.  
Copyright (c) 2026 **Ayusman Samantaray**. All rights reserved.
