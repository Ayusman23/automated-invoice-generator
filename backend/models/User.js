const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: false // Not required for OAuth
    },
    googleId: {
        type: String,
        default: null
    },
    mobileNumber: {
        type: String,
        default: ''
    },
    whatsappConnected: {
        type: Boolean,
        default: false
    },
    // Tokens for Gmail API
    googleAccessToken: {
        type: String,
        default: null
    },
    googleRefreshToken: {
        type: String,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
