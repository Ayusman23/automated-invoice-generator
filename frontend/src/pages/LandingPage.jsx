import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/* ---------- Icons (single-weight line icons, no emoji) ---------- */
const Icon = ({ children, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const IconInvoice = (p) => <Icon {...p}><path d="M6 2h9l3 3v17H6z" /><path d="M15 2v3h3" /><path d="M9 10h6M9 13h6M9 16h4" /></Icon>;
const IconWhatsapp = (p) => <Icon {...p}><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19l-4 1z" /><path d="M8.5 9.5c0 3.5 3 6.5 6.5 6.5.8 0 1.2-.6 1.2-1.1v-1c0-.3-.2-.5-.5-.6l-1.8-.6c-.3-.1-.6 0-.7.3l-.4.7c-1.1-.5-2-1.4-2.5-2.5l.7-.4c.3-.1.4-.4.3-.7l-.6-1.8c-.1-.3-.3-.5-.6-.5h-1c-.5 0-1.1.4-1.1 1.2z" /></Icon>;
const IconMail = (p) => <Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></Icon>;
const IconPdf = (p) => <Icon {...p}><path d="M7 2h8l5 5v15H7z" /><path d="M15 2v5h5" /><path d="M10 13v4M12.5 13v4c1.2 0 2-.9 2-2s-.8-2-2-2z" /></Icon>;
const IconScan = (p) => <Icon {...p}><path d="M4 8V5a1 1 0 0 1 1-1h3M4 16v3a1 1 0 0 0 1 1h3M20 8V5a1 1 0 0 0-1-1h-3M20 16v3a1 1 0 0 1-1 1h-3" /><path d="M4 12h16" /></Icon>;
const IconCard = (p) => <Icon {...p}><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 10h19" /><path d="M6 15h4" /></Icon>;
const IconShield = (p) => <Icon {...p}><path d="M12 2l8 3.5V11c0 5.2-3.4 8.9-8 10-4.6-1.1-8-4.8-8-10V5.5z" /><path d="M9 12l2 2 4-4.5" /></Icon>;
const IconLock = (p) => <Icon {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></Icon>;
const IconReceipt = (p) => <Icon {...p}><path d="M6 2h12v20l-2.5-1.5L13 22l-2.5-1.5L8 22l-2-1.5z" /><path d="M9 7h6M9 11h6M9 15h4" /></Icon>;
const IconStar = (p) => <Icon {...p}><path d="M12 3l2.6 5.6 6.2.6-4.6 4.2 1.3 6.1L12 16.7 6.5 19.5l1.3-6.1L3.2 9.2l6.2-.6z" /></Icon>;

const FEATURES = [
  { Icon: IconInvoice, title: 'Create invoices fast', desc: 'Add line items, taxes and client details, and the totals calculate themselves. Most invoices take under a minute.' },
  { Icon: IconWhatsapp, title: 'Send over WhatsApp', desc: 'Deliver the PDF straight to your client’s WhatsApp, with a read receipt so you know it landed.' },
  { Icon: IconMail, title: 'Email from your address', desc: 'Invoices go out from your own Gmail, formatted and branded, with a payment link built in.' },
  { Icon: IconPdf, title: 'Branded PDFs, every time', desc: 'Every invoice is saved as a clean, print-ready PDF with your logo, GSTIN and terms.' },
  { Icon: IconScan, title: 'Scan handwritten notes', desc: 'Photograph a handwritten bill and the fields fill in automatically — check it over before you send.' },
  { Icon: IconCard, title: 'Get paid online', desc: 'Clients pay by UPI, card or netbanking through Razorpay. Funds settle to your bank account.' },
];

const TRUST_POINTS = [
  { Icon: IconLock, title: 'Encrypted in transit and at rest', desc: 'Invoice and client data is encrypted end to end, on our servers and in your browser.' },
  { Icon: IconShield, title: 'PCI-DSS compliant payments', desc: 'Payments are processed by Razorpay, a licensed payment aggregator regulated by the RBI. We never store card numbers.' },
  { Icon: IconReceipt, title: 'GST-ready by default', desc: 'Every invoice supports GSTIN, HSN codes and tax breakdowns, formatted the way your accountant expects.' },
];

const TESTIMONIALS = [
  { quote: 'I stopped chasing clients for payment. The WhatsApp reminder does that for me now.', name: 'Ananya R.', role: 'Freelance UI Designer' },
  { quote: 'Our accountant asked where I finally started getting proper GST invoices from. This is it.', name: 'Vikram S.', role: 'Independent Consultant' },
  { quote: 'Three of us run a small studio and it replaced a spreadsheet three people were scared to touch.', name: 'Fatima K.', role: 'Founder, small design studio' },
];

const FAQS = [
  { q: 'Is my client data safe?', a: 'Yes. All data is encrypted, backed up daily, and never sold or shared with third parties. You can export or delete your data at any time.' },
  { q: 'Who processes the payments?', a: 'Razorpay, a payment aggregator licensed by the Reserve Bank of India. We route payments to them and never touch your client’s card details.' },
  { q: 'Is it really free?', a: 'Yes, invoicing, WhatsApp and email delivery, and PDF generation are free to use. There are no hidden charges to start.' },
  { q: 'What happens if a payment fails?', a: 'Your client sees a clear retry option, and you get notified so you can follow up directly if needed.' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#FAF9F6', color: '#10151F', minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        .serif { font-family: 'Fraunces', Georgia, serif; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .btn-primary { display:inline-flex; align-items:center; gap:8px; padding:14px 30px; border-radius:8px; border:none; cursor:pointer; background:#16345C; color:#fff; font-size:15px; font-weight:700; font-family:'Inter',sans-serif; transition:background 0.15s, transform 0.15s; }
        .btn-primary:hover { background:#0F2643; transform:translateY(-1px); }
        .btn-primary:focus-visible, .btn-secondary:focus-visible, .faq-row:focus-visible { outline:2px solid #16345C; outline-offset:2px; }
        .btn-secondary { display:inline-flex; align-items:center; gap:8px; padding:13px 26px; border-radius:8px; cursor:pointer; background:transparent; color:#16345C; font-size:15px; font-weight:600; border:1.5px solid #16345C; font-family:'Inter',sans-serif; transition:background 0.15s; }
        .btn-secondary:hover { background:rgba(22,52,92,0.06); }
        .feature-card { background:#fff; border:1px solid #E4E1DA; border-radius:14px; padding:26px; transition:border-color 0.15s, box-shadow 0.15s; }
        .feature-card:hover { border-color:#C9C4B8; box-shadow:0 6px 20px rgba(16,21,31,0.06); }
        .grid-3 { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
        .grid-3-trust { display:grid; grid-template-columns:repeat(3,1fr); gap:28px; }
        @media(max-width:900px){.grid-3{grid-template-columns:repeat(2,1fr);}.grid-3-trust{grid-template-columns:1fr;}.hero-cols{grid-template-columns:1fr!important;}.hero-doc{margin-top:40px;}}
        @media(max-width:600px){.grid-3{grid-template-columns:1fr;}.stats-row{grid-template-columns:repeat(2,1fr)!important;}.hero-btns{flex-direction:column;align-items:stretch;}}
        @media (prefers-reduced-motion: reduce) { * { animation:none!important; transition:none!important; } }
        .faq-row { width:100%; text-align:left; background:none; border:none; cursor:pointer; padding:20px 0; display:flex; justify-content:space-between; align-items:center; gap:16px; font-family:'Inter',sans-serif; }
      `}</style>

      {/* Navbar */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: scrolled ? 'rgba(250,249,246,0.92)' : 'transparent', backdropFilter: scrolled ? 'blur(10px)' : 'none', borderBottom: scrolled ? '1px solid #E4E1DA' : '1px solid transparent', transition: 'background 0.2s, border-color 0.2s' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '0 32px', height: '68px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', background: '#16345C', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <IconReceipt size={18} />
            </div>
            <span className="serif" style={{ fontWeight: 600, fontSize: '19px', color: '#10151F' }}>InvoicePro</span>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-secondary" onClick={() => navigate('/login')} style={{ padding: '9px 20px', fontSize: '14px' }}>Log in</button>
            <button className="btn-primary" onClick={() => navigate('/signup')} style={{ padding: '9px 20px', fontSize: '14px' }}>Get started free</button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: '1180px', margin: '0 auto', padding: '150px 32px 90px' }}>
        <div className="hero-cols" style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: '56px', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '6px 14px', borderRadius: '100px', background: '#fff', border: '1px solid #E4E1DA', fontSize: '13px', fontWeight: 600, color: '#0E7C4A', marginBottom: '22px' }}>
              <IconShield size={14} /> GST-ready invoicing, free to start
            </div>
            <h1 className="serif" style={{ fontSize: 'clamp(36px,4.6vw,54px)', fontWeight: 600, lineHeight: 1.12, marginBottom: '22px', color: '#10151F', letterSpacing: '-0.01em' }}>
              Send invoices your clients actually trust.
            </h1>
            <p style={{ fontSize: '17px', color: '#4B5361', lineHeight: 1.7, maxWidth: '480px', marginBottom: '32px' }}>
              Create a professional, GST-compliant invoice, deliver it by WhatsApp or email, and get paid by UPI or card — without a spreadsheet in sight.
            </p>
            <div className="hero-btns" style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '28px' }}>
              <button className="btn-primary" onClick={() => navigate('/signup')} style={{ fontSize: '16px', padding: '15px 32px' }}>Create your first invoice</button>
              <button className="btn-secondary" onClick={() => navigate('/login')} style={{ fontSize: '15px', padding: '14px 26px' }}>Sign in</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px', fontSize: '13px', color: '#6B7280', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><IconLock size={14} /> Bank-grade encryption</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><IconCard size={14} /> Razorpay payments</span>
              <span>No credit card to sign up</span>
            </div>
          </div>

          {/* Signature element: a real-looking invoice document */}
          <div className="hero-doc" style={{ position: 'relative' }}>
            <div style={{ background: '#fff', border: '1px solid #E4E1DA', borderRadius: '12px', boxShadow: '0 20px 50px rgba(16,21,31,0.10)', padding: '30px 30px 26px', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px' }}>
                <div>
                  <div className="serif" style={{ fontWeight: 600, fontSize: '16px', color: '#10151F' }}>Studio Kavya</div>
                  <div className="mono" style={{ fontSize: '11px', color: '#8B93A1', marginTop: '2px' }}>GSTIN 21ABCDE1234F1Z5</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: '11px', color: '#8B93A1' }}>INVOICE</div>
                  <div className="mono" style={{ fontSize: '13px', color: '#10151F', fontWeight: 600 }}>#INV-0187</div>
                </div>
              </div>
              <div style={{ borderTop: '1px solid #EEEBE3', borderBottom: '1px solid #EEEBE3', padding: '16px 0', marginBottom: '16px' }}>
                {[['Brand identity design', '₹24,000'], ['Landing page (3 revisions)', '₹18,500'], ['GST @18%', '₹7,650']].map(([label, amt]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#4B5361', padding: '5px 0' }}>
                    <span>{label}</span><span className="mono">{amt}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#10151F' }}>Total due</span>
                <span className="mono" style={{ fontSize: '20px', fontWeight: 600, color: '#10151F' }}>₹50,150</span>
              </div>
              <div style={{ position: 'absolute', top: '86px', right: '28px', border: '2px solid #0E7C4A', borderRadius: '6px', color: '#0E7C4A', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', padding: '4px 10px', transform: 'rotate(-8deg)' }}>
                PAID
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', fontSize: '12.5px', color: '#8B93A1' }}>
              <IconWhatsapp size={14} /> Delivered via WhatsApp · opened 4 minutes ago
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section style={{ padding: '28px 24px', background: '#fff', borderTop: '1px solid #E4E1DA', borderBottom: '1px solid #E4E1DA' }}>
        <p style={{ textAlign: 'center', fontSize: '13px', color: '#8B93A1', letterSpacing: '0.03em', textTransform: 'uppercase', fontWeight: 600 }}>
          Built for freelancers, consultants and small studios across India
        </p>
      </section>

      {/* Stats */}
      <section style={{ padding: '46px 24px', background: '#FAF9F6' }}>
        <div className="stats-row" style={{ maxWidth: '900px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '24px' }}>
          {[['Free', 'To start invoicing'], ['≤ 1 min', 'To create an invoice'], ['GST', 'Compliant by default'], ['UPI · Cards', 'Ways clients can pay']].map(([value, label]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: '24px', fontWeight: 600, color: '#16345C' }}>{value}</div>
              <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '6px', fontWeight: 500 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '90px 24px 40px' }}>
        <div style={{ marginBottom: '48px', maxWidth: '560px' }}>
          <h2 className="serif" style={{ fontSize: 'clamp(26px,3.4vw,38px)', fontWeight: 600, color: '#10151F', marginBottom: '14px' }}>
            Everything an invoice needs to do
          </h2>
          <p style={{ color: '#6B7280', fontSize: '16px', lineHeight: 1.6 }}>
            No new habits to learn — it fits into WhatsApp and email, the tools your clients already check.
          </p>
        </div>
        <div className="grid-3">
          {FEATURES.map(({ Icon: FIcon, title, desc }) => (
            <div key={title} className="feature-card">
              <div style={{ width: '38px', height: '38px', borderRadius: '9px', background: '#F0EEE7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16345C', marginBottom: '16px' }}>
                <FIcon size={19} />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#10151F', marginBottom: '8px' }}>{title}</h3>
              <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: 1.65 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Security & compliance */}
      <section style={{ background: '#10151F', padding: '80px 24px', marginTop: '40px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ marginBottom: '44px', maxWidth: '560px' }}>
            <h2 className="serif" style={{ fontSize: 'clamp(24px,3vw,34px)', fontWeight: 600, color: '#fff', marginBottom: '12px' }}>
              Your clients’ money and data are handled carefully
            </h2>
            <p style={{ color: '#9AA3B0', fontSize: '15.5px', lineHeight: 1.65 }}>
              We built this for people who put their name on every invoice they send. Here’s exactly how it’s protected.
            </p>
          </div>
          <div className="grid-3-trust">
            {TRUST_POINTS.map(({ Icon: TIcon, title, desc }) => (
              <div key={title}>
                <div style={{ width: '36px', height: '36px', borderRadius: '9px', border: '1px solid #2A3242', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5FC98A', marginBottom: '14px' }}>
                  <TIcon size={18} />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>{title}</h3>
                <p style={{ fontSize: '13.5px', color: '#9AA3B0', lineHeight: 1.65 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '90px 24px' }}>
        <h2 className="serif" style={{ fontSize: 'clamp(24px,3vw,34px)', fontWeight: 600, color: '#10151F', marginBottom: '44px', textAlign: 'center' }}>
          Trusted by people who bill for a living
        </h2>
        <div className="grid-3">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="feature-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '3px', color: '#D4A017' }}>
                {Array.from({ length: 5 }).map((_, i) => <IconStar key={i} size={14} />)}
              </div>
              <p style={{ fontSize: '14.5px', color: '#374151', lineHeight: 1.65, fontStyle: 'italic' }}>&ldquo;{t.quote}&rdquo;</p>
              <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #EEEBE3' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#10151F' }}>{t.name}</div>
                <div style={{ fontSize: '12.5px', color: '#8B93A1' }}>{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: '760px', margin: '0 auto', padding: '20px 24px 90px' }}>
        <h2 className="serif" style={{ fontSize: 'clamp(24px,3vw,32px)', fontWeight: 600, color: '#10151F', marginBottom: '28px', textAlign: 'center' }}>
          Questions people ask before they switch
        </h2>
        <div style={{ background: '#fff', border: '1px solid #E4E1DA', borderRadius: '14px', padding: '4px 24px' }}>
          {FAQS.map((f, i) => (
            <div key={f.q} style={{ borderBottom: i < FAQS.length - 1 ? '1px solid #EEEBE3' : 'none' }}>
              <button className="faq-row" onClick={() => setOpenFaq(openFaq === i ? -1 : i)} aria-expanded={openFaq === i}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#10151F' }}>{f.q}</span>
                <span style={{ fontSize: '18px', color: '#8B93A1', flexShrink: 0 }}>{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && (
                <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: 1.65, paddingBottom: '20px', maxWidth: '600px' }}>{f.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '20px 24px 100px', textAlign: 'center' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', background: '#16345C', borderRadius: '20px', padding: '56px 40px' }}>
          <h2 className="serif" style={{ fontSize: 'clamp(24px,3.4vw,36px)', fontWeight: 600, color: '#fff', marginBottom: '14px' }}>
            Send your next invoice in under a minute
          </h2>
          <p style={{ color: '#B9C4D4', fontSize: '15.5px', marginBottom: '32px' }}>
            Free to start. No card required. Cancel anytime — there’s nothing to cancel.
          </p>
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => navigate('/signup')} style={{ fontSize: '15.5px', padding: '14px 30px', background: '#fff', color: '#16345C' }}>Create free account</button>
            <button className="btn-secondary" onClick={() => navigate('/login')} style={{ fontSize: '14.5px', padding: '13px 24px', color: '#fff', borderColor: '#3E5A7C' }}>Sign in</button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #E4E1DA', padding: '36px 24px', background: '#fff' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', color: '#6B7280', fontSize: '13px' }}>
            <IconReceipt size={15} /> © 2026 InvoicePro
          </div>
          <div style={{ display: 'flex', gap: '22px', fontSize: '13px', color: '#6B7280' }}>
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>Contact</span>
          </div>
        </div>
      </footer>
    </div>
  );
}