import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import API from '../api';

// ─── Design Tokens (same system as AdminPage) ─────────────────────────────────
const C = {
  bg:      '#F9FAFB',
  surface: '#FFFFFF',
  border:  '#E5E7EB',
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  textPrimary:   '#111827',
  textSecondary: '#6B7280',
  textMuted:     '#9CA3AF',
  paid:   { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0' },
  unpaid: { bg: '#FFFBEB', text: '#92400E', border: '#FCD34D' },
  shadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  shadowLg: '0 20px 25px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.04)',
};

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (document.getElementById('razorpay-script')) { resolve(true); return; }
    const s   = document.createElement('script');
    s.id      = 'razorpay-script';
    s.src     = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function PayPage() {
  const { invoiceId } = useParams();

  const [invoice,      setInvoice]     = useState(null);
  const [loading,      setLoading]     = useState(true);
  const [payStatus,    setPayStatus]   = useState('idle'); // idle | processing | success | failed
  const [errorMsg,     setErrorMsg]    = useState('');
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/invoices/${invoiceId}`)
      .then(r => { if (!r.ok) throw new Error('Invoice not found'); return r.json(); })
      .then(d  => { setInvoice(d); if (d.status === 'PAID') setPayStatus('success'); })
      .catch(e => setErrorMsg(e.message))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  const notify = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handlePayNow = async () => {
    const loaded = await loadRazorpayScript();
    if (!loaded) { notify('Razorpay could not load. Check your connection.', 'error'); return; }
    setPayStatus('processing');
    try {
      const res  = await fetch(`${API}/api/payment/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      });
      const data = await res.json();
      if (!res.ok) { setPayStatus('idle'); notify(data.message || 'Could not create payment order.', 'error'); return; }

      new window.Razorpay({
        key:         data.keyId,
        amount:      data.amount,
        currency:    data.currency,
        name:        'InvoicePro',
        description: `Invoice #${String(invoiceId).slice(-8).toUpperCase()}`,
        order_id:    data.orderId,
        prefill:     { name: invoice?.clientName, email: invoice?.email, contact: invoice?.phone || '' },
        theme:       { color: C.primary },
        modal:       { ondismiss: () => { setPayStatus('idle'); notify('Payment cancelled. You can try again.'); } },

        // ── handler fires AFTER the user completes payment in Razorpay modal ──
        handler: async (paymentResponse) => {
          notify('Verifying payment…');
          // Call our verify endpoint directly — no webhook needed for localhost
          try {
            const vRes = await fetch(`${API}/api/payment/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id:   paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature:  paymentResponse.razorpay_signature,
                invoiceId,
              }),
            });
            const vData = await vRes.json();
            if (vRes.ok && vData.success) {
              // Verified ✅ — update local state immediately
              setInvoice(prev => ({ ...prev, status: 'PAID' }));
              setPayStatus('success');
            } else {
              // Verify endpoint returned an error — fall back to polling
              notify('Direct verify failed, polling for update…');
              pollForPaidStatus(0);
            }
          } catch {
            // Network error on verify call — fall back to polling
            pollForPaidStatus(0);
          }
        },
      }).open();
    } catch {
      setPayStatus('idle');
      notify('Could not initiate payment. Please try again.', 'error');
    }
  };

  // Fallback: poll the database every 2 s (up to 12 attempts = 24 s).
  // Only reached if the /verify call itself fails for some network reason.
  const pollForPaidStatus = (attempts = 0) => {
    if (attempts > 12) { setPayStatus('failed'); notify('Verification timed out. Contact support if charged.', 'error'); return; }
    setTimeout(async () => {
      try {
        const res  = await fetch(`${API}/api/invoices/${invoiceId}`);
        const data = await res.json();
        if (data.status === 'PAID') { setInvoice(data); setPayStatus('success'); }
        else pollForPaidStatus(attempts + 1);
      } catch { pollForPaidStatus(attempts + 1); }
    }, 2000);
  };

  // ─── Styles ────────────────────────────────────────────────────────────────
  const globalStyle = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { margin: 0; background: ${C.bg}; font-family: Inter, system-ui, sans-serif; }
    @keyframes fadeUp  { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
    @keyframes popIn   { from { opacity:0; transform:scale(0.9); }         to { opacity:1; transform:scale(1); } }
    @keyframes checkDraw { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
    @keyframes spin    { to { transform: rotate(360deg); } }
  `;

  const pageWrap = {
    minHeight: '100vh', background: C.bg,
    fontFamily: 'Inter, system-ui, sans-serif', color: C.textPrimary,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '40px 16px',
  };

  const notifyBg   = { success: '#F0FDF4', error: '#FEF2F2', info: '#EFF6FF' };
  const notifyText = { success: '#166534', error: '#991B1B', info: '#1E40AF' };
  const notifyBdr  = { success: '#BBF7D0', error: '#FECACA', info: '#BFDBFE' };

  // ─── LOADING ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={pageWrap}>
      <style>{globalStyle}</style>
      <div style={{ width: '36px', height: '36px', border: `3px solid ${C.border}`, borderTopColor: C.primary,
        borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: C.textMuted, fontSize: '14px', marginTop: '16px' }}>Loading invoice…</p>
    </div>
  );

  // ─── NOT FOUND ─────────────────────────────────────────────────────────────
  if (errorMsg) return (
    <div style={pageWrap}>
      <style>{globalStyle}</style>
      <div style={{
        background: C.surface, border: `1px solid #FECACA`,
        borderRadius: '16px', padding: '48px 40px', textAlign: 'center', maxWidth: '440px',
        boxShadow: C.shadowLg,
      }}>
        <div style={{ width: '56px', height: '56px', background: '#FEF2F2', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', margin: '0 auto 16px' }}>🚫</div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#991B1B', marginBottom: '8px' }}>Invoice Not Found</h2>
        <p style={{ color: C.textSecondary, fontSize: '14px' }}>{errorMsg}</p>
      </div>
    </div>
  );

  // ─── SUCCESS ───────────────────────────────────────────────────────────────
  if (payStatus === 'success') return (
    <div style={pageWrap}>
      <style>{globalStyle}</style>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: '20px', padding: '48px 40px', textAlign: 'center', maxWidth: '460px', width: '100%',
        boxShadow: C.shadowLg, animation: 'popIn 0.35s ease',
      }}>
        {/* Checkmark */}
        <div style={{ width: '72px', height: '72px', margin: '0 auto 24px' }}>
          <svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%' }}>
            <circle cx="36" cy="36" r="35" fill="#ECFDF5" stroke="#4ADE80" strokeWidth="1.5"/>
            <path d="M20 37L31 48L52 26" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="100" strokeDashoffset="0"
              style={{ animation: 'checkDraw 0.5s 0.1s ease both' }}/>
          </svg>
        </div>

        <h1 style={{ fontSize: '24px', fontWeight: 800, color: C.textPrimary, marginBottom: '6px' }}>Payment Successful</h1>
        <p style={{ color: C.textSecondary, fontSize: '15px', marginBottom: '32px' }}>
          Thank you, <strong>{invoice?.clientName}</strong>. Your payment has been received.
        </p>

        {/* Receipt */}
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden', textAlign: 'left', marginBottom: '24px' }}>
          {[
            ['Invoice ID',   `#${String(invoice?._id).slice(-8).toUpperCase()}`],
            ['Item',          invoice?.itemName],
            ['Amount Paid',  `₹${Number(invoice?.amount).toLocaleString('en-IN')}`],
            ['Date',          new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })],
            ['Status',        '✓ Paid'],
          ].map(([label, val], i) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 18px', borderBottom: i < 4 ? `1px solid ${C.border}` : 'none',
            }}>
              <span style={{ fontSize: '13px', color: C.textSecondary }}>{label}</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: label === 'Amount Paid' ? '#16A34A' : label === 'Status' ? '#16A34A' : C.textPrimary }}>
                {val}
              </span>
            </div>
          ))}
        </div>

        <p style={{ fontSize: '13px', color: C.textMuted }}>
          A confirmation receipt has been sent to your email. 🙏
        </p>
      </div>
    </div>
  );

  // ─── FAILED ────────────────────────────────────────────────────────────────
  if (payStatus === 'failed') return (
    <div style={pageWrap}>
      <style>{globalStyle}</style>
      <div style={{
        background: C.surface, border: `1px solid #FECACA`,
        borderRadius: '20px', padding: '48px 40px', textAlign: 'center', maxWidth: '460px', width: '100%',
        boxShadow: C.shadowLg,
      }}>
        <div style={{ width: '56px', height: '56px', background: '#FEF2F2', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', margin: '0 auto 20px' }}>⚠️</div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#991B1B', marginBottom: '8px' }}>Payment Failed</h2>
        <p style={{ color: C.textSecondary, fontSize: '14px', lineHeight: 1.6, marginBottom: '28px' }}>
          We could not process <strong>₹{Number(invoice?.amount).toLocaleString('en-IN')}</strong> for{' '}
          <em>{invoice?.itemName}</em>. Please try again.
        </p>
        <button onClick={() => setPayStatus('idle')} style={{
          padding: '12px 32px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          background: '#DC2626', color: '#fff', fontWeight: 700, fontSize: '15px', fontFamily: 'Inter, sans-serif',
        }}>
          Try Again
        </button>
      </div>
    </div>
  );

  // ─── IDLE / CHECKOUT ───────────────────────────────────────────────────────
  const isAlreadyPaid = invoice?.status === 'PAID';

  return (
    <div style={pageWrap}>
      <style>{globalStyle}</style>

      {/* Toast */}
      {notification && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
          background: notifyBg[notification.type] || notifyBg.info,
          color: notifyText[notification.type] || notifyText.info,
          border: `1px solid ${notifyBdr[notification.type] || notifyBdr.info}`,
          borderRadius: '10px', padding: '12px 18px', maxWidth: '360px',
          fontSize: '14px', fontWeight: 500, boxShadow: C.shadowLg,
        }}>
          {notification.msg}
        </div>
      )}

      <div style={{ width: '100%', maxWidth: '480px', animation: 'fadeUp 0.3s ease' }}>

        {/* Brand header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '44px', height: '44px', background: C.primary, borderRadius: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', margin: '0 auto 12px',
            boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
          }}>⚡</div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: C.textPrimary }}>InvoicePro</h1>
          <p style={{ fontSize: '13px', color: C.textMuted, marginTop: '3px' }}>Secure Payment Portal</p>
        </div>

        {/* Checkout card */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: '16px', overflow: 'hidden', boxShadow: C.shadowLg,
        }}>

          {/* Card header strip */}
          <div style={{
            background: C.primary, padding: '20px 28px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px' }}>
                Secure Checkout
              </p>
              <p style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>
                Invoice #{String(invoice?._id).slice(-8).toUpperCase()}
              </p>
            </div>
            <span style={{
              background: isAlreadyPaid ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '20px', padding: '5px 12px',
              fontSize: '12px', fontWeight: 600, color: '#fff',
            }}>
              {isAlreadyPaid ? '✓ Paid' : 'Unpaid'}
            </span>
          </div>

          {/* Card body */}
          <div style={{ padding: '28px' }}>

            {/* Billed To */}
            <div style={{ marginBottom: '24px', paddingBottom: '20px', borderBottom: `1px solid ${C.border}` }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>
                Billed To
              </p>
              <p style={{ fontWeight: 700, fontSize: '18px', color: C.textPrimary }}>{invoice?.clientName}</p>
              <p style={{ fontSize: '13px', color: C.textSecondary, marginTop: '2px' }}>{invoice?.email}</p>
            </div>

            {/* Invoice Date */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', color: C.textSecondary }}>Invoice Date</span>
              <span style={{ fontSize: '14px', fontWeight: 500, color: C.textPrimary }}>
                {new Date(invoice?.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}
              </span>
            </div>

            {/* Items breakdown */}
            <div style={{ marginBottom: '4px' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' }}>
                Items
              </p>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                {/* Column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 80px 80px',
                  padding: '8px 14px', background: C.bg,
                  fontSize: '11px', fontWeight: 600, color: C.textMuted,
                  textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  <span>Description</span>
                  <span style={{ textAlign: 'center' }}>Qty</span>
                  <span style={{ textAlign: 'right' }}>Price</span>
                  <span style={{ textAlign: 'right' }}>Total</span>
                </div>
                {/* Item rows */}
                {(invoice?.items && invoice.items.length > 0
                  ? invoice.items
                  : [{ name: invoice?.itemName || '—', qty: 1, price: invoice?.amount }]
                ).map((item, idx) => {
                  const subtotal = (Number(item.qty) || 1) * Number(item.price);
                  return (
                    <div key={idx} style={{
                      display: 'grid', gridTemplateColumns: '1fr 40px 80px 80px',
                      padding: '10px 14px', fontSize: '13px',
                      borderTop: `1px solid ${C.border}`,
                      background: idx % 2 === 0 ? C.surface : C.bg,
                    }}>
                      <span style={{ color: C.textPrimary, fontWeight: 500 }}>{item.name}</span>
                      <span style={{ textAlign: 'center', color: C.textSecondary }}>{Number(item.qty) || 1}</span>
                      <span style={{ textAlign: 'right', color: C.textSecondary }}>₹{Number(item.price).toLocaleString('en-IN')}</span>
                      <span style={{ textAlign: 'right', fontWeight: 600, color: C.textPrimary }}>₹{subtotal.toLocaleString('en-IN')}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Total amount */}
            <div style={{
              background: '#EFF6FF', border: '1px solid #BFDBFE',
              borderRadius: '12px', padding: '18px 20px', margin: '20px 0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <p style={{ fontSize: '12px', color: '#1E40AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                  Total Amount Due
                </p>
                <p style={{ fontSize: '30px', fontWeight: 800, color: C.primary, lineHeight: 1 }}>
                  ₹{Number(invoice?.amount).toLocaleString('en-IN')}
                </p>
              </div>
              <div style={{ width: '48px', height: '48px', background: '#DBEAFE', borderRadius: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>💳</div>
            </div>

            {/* CTA button */}
            {!isAlreadyPaid ? (
              <button id="btn-pay-now" onClick={handlePayNow} disabled={payStatus === 'processing'}
                style={{
                  width: '100%', padding: '15px', borderRadius: '10px', border: 'none',
                  cursor: payStatus === 'processing' ? 'wait' : 'pointer',
                  background: payStatus === 'processing' ? '#93C5FD' : C.primary,
                  color: '#fff', fontWeight: 700, fontSize: '16px', fontFamily: 'Inter, sans-serif',
                  transition: 'background 0.15s, box-shadow 0.15s',
                  boxShadow: payStatus !== 'processing' ? '0 2px 8px rgba(37,99,235,0.35)' : 'none',
                }}
                onMouseEnter={e => { if (payStatus !== 'processing') e.target.style.background = C.primaryDark; }}
                onMouseLeave={e => { if (payStatus !== 'processing') e.target.style.background = C.primary; }}
              >
                {payStatus === 'processing'
                  ? 'Processing…'
                  : `Pay ₹${Number(invoice?.amount).toLocaleString('en-IN')} Securely`}
              </button>
            ) : (
              <div style={{
                textAlign: 'center', padding: '15px',
                background: C.paid.bg, border: `1px solid ${C.paid.border}`,
                borderRadius: '10px', color: C.paid.text, fontWeight: 700, fontSize: '15px',
              }}>
                ✓ This invoice has already been paid. Thank you!
              </div>
            )}

            {/* Trust indicators */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
              marginTop: '16px', fontSize: '12px', color: C.textMuted }}>
              <span>🔒 256-bit SSL</span>
              <span style={{ width: '1px', height: '12px', background: C.border }} />
              <span>Secured by Razorpay</span>
              <span style={{ width: '1px', height: '12px', background: C.border }} />
              <span>PCI DSS Compliant</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', color: C.textMuted, fontSize: '12px', marginTop: '20px' }}>
          Questions?{' '}
          <a href="mailto:support@invoicepro.in" style={{ color: C.primary, textDecoration: 'none', fontWeight: 500 }}>
            support@invoicepro.in
          </a>
        </p>
      </div>
    </div>
  );
}
