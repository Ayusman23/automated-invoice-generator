import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { io } from 'socket.io-client';
import { API_URL } from '../api';
import './Settings.css';

export default function Settings() {
    const { user } = useAuth();
    const [qrCode, setQrCode] = useState(null);
    const [waStatus, setWaStatus] = useState('DISCONNECTED');
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        const newSocket = io(API_URL, {
            transports: ['polling', 'websocket'],
            withCredentials: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 2000,
            timeout: 20000,
        });
        setSocket(newSocket);

        if (user?._id) {
            newSocket.emit('get-whatsapp-status', { userId: String(user._id) });
        }

        newSocket.on('whatsapp-qr', (data) => {
            if (!data.userId || String(data.userId) === String(user?._id)) {
                setQrCode(data.qr);
                setWaStatus('QR_READY');
            }
        });

        newSocket.on('whatsapp-status', (data) => {
            if (!data.userId || String(data.userId) === String(user?._id)) {
                setWaStatus(data.status);
                if (data.status === 'READY') {
                    setQrCode(null);
                }
            }
        });

        return () => newSocket.close();
    }, [user]);

    const startWhatsApp = () => {
        if (socket && user) {
            setWaStatus('INITIALIZING');
            socket.emit('start-whatsapp', { userId: String(user._id) });
        }
    };

    const disconnectWhatsApp = () => {
        if (socket && user) {
            socket.emit('disconnect-whatsapp', { userId: String(user._id) });
        }
    };

    return (
        <div className="settings-container">
            <header className="settings-header">
                <h2>Account Settings</h2>
                <p>Manage your integrations</p>
            </header>

            <div className="settings-grid">
                {/* Email Settings */}
                <div className="settings-card">
                    <div className="card-header">
                        <h3>📧 Email Integration</h3>
                        <span className="badge active">Connected via Google</span>
                    </div>
                    <div className="card-body">
                        <p>Your invoices will be sent from <strong>{user?.email}</strong>.</p>
                        <p className="subtext">Because you signed in with Google, we securely use your Gmail to send invoices automatically.</p>
                    </div>
                </div>

                {/* WhatsApp Settings */}
                <div className="settings-card">
                    <div className="card-header">
                        <h3>📱 WhatsApp Integration</h3>
                        <span className={`badge ${waStatus === 'READY' ? 'active' : 'inactive'}`}>
                            {waStatus === 'READY' ? 'Connected' : waStatus}
                        </span>
                    </div>
                    <div className="card-body">
                        <p>Link your WhatsApp account to automatically send invoices and payment receipts via WhatsApp.</p>
                        
                        {waStatus === 'DISCONNECTED' || waStatus === 'AUTH_FAILED' || waStatus === 'ERROR' ? (
                            <button className="primary-btn" onClick={startWhatsApp}>
                                Connect WhatsApp
                            </button>
                        ) : waStatus === 'INITIALIZING' ? (
                            <div className="loader-container">
                                <div className="loader"></div>
                                <p>Generating QR Code...</p>
                            </div>
                        ) : waStatus === 'READY' ? (
                            <div className="connected-box">
                                <p>✅ Your WhatsApp is connected and ready to send invoices.</p>
                                <button className="danger-btn" onClick={disconnectWhatsApp}>Disconnect</button>
                            </div>
                        ) : null}

                        {qrCode && (
                            <div className="qr-container">
                                <p>Scan this QR code with your WhatsApp app (Linked Devices)</p>
                                {/* We can use a library like qrcode.react, or just send the base64 string from backend.
                                    Wait, the backend sends the raw QR string. We need to render it.
                                    Let's use an img tag with a free QR generator API if we don't have a lib. */}
                                <img 
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCode)}`} 
                                    alt="WhatsApp QR Code" 
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
