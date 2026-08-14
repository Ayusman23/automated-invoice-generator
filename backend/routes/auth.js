const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const User = require('../models/User');

const createToken = (_id) => {
    return jwt.sign({ _id }, process.env.JWT_SECRET || 'supersecretjwtkey', { expiresIn: '7d' });
};

// ── Input Validation Middleware ─────────────────────────────────────────────
const validateAuthInput = (req, res, next) => {
    const { email, password, name } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }
    if (req.path === '/signup' && (!name || typeof name !== 'string' || name.trim().length < 2)) {
        return res.status(400).json({ error: 'Name must be at least 2 characters long.' });
    }
    next();
};

// ── Email/Password Signup ─────────────────────────────────────────────────────
router.post('/signup', validateAuthInput, async (req, res) => {
    const { name, email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ error: 'Email already in use' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        user = await User.create({ name: name.trim(), email: email.toLowerCase().trim(), password: hashedPassword });
        const token = createToken(user._id);

        res.status(201).json({ email: user.email, name: user.name, token, _id: user._id });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ── Email/Password Login ──────────────────────────────────────────────────────
router.post('/login', validateAuthInput, async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });
        
        if (!user.password) {
            return res.status(400).json({ error: 'Please login using Google' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: 'Invalid credentials' });

        const token = createToken(user._id);
        res.status(200).json({ email, name: user.name, token, _id: user._id, whatsappConnected: user.whatsappConnected });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ── Google OAuth (Clean Standard OAuth for instant login without security warnings) ──
router.get('/google', passport.authenticate('google', { 
    scope: ['profile', 'email']
}));

router.get('/google/callback', passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL || 'https://automated-invoice-generator-tau.vercel.app'}/login` }), (req, res) => {
    // Successful authentication, generate JWT and redirect to frontend with token in URL (or send via cookie)
    const frontendUrl = process.env.FRONTEND_URL || 'https://automated-invoice-generator-tau.vercel.app';
    const token = createToken(req.user._id);
    res.redirect(`${frontendUrl}/oauth-callback?token=${token}&id=${req.user._id}&name=${encodeURIComponent(req.user.name)}&email=${encodeURIComponent(req.user.email)}`);
});

// ── Get Current User Details ──────────────────────────────────────────────────
router.get('/me', async (req, res) => {
    const { authorization } = req.headers;
    if (!authorization) return res.status(401).json({ error: 'Auth required' });
    const token = authorization.split(' ')[1];
    try {
        const { _id } = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkey');
        const user = await User.findById(_id).select('-password -googleAccessToken -googleRefreshToken');
        res.status(200).json(user);
    } catch (error) {
        res.status(401).json({ error: 'Not authorized' });
    }
});

module.exports = router;
