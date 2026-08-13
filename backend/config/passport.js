const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID || 'dummy_client_id',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy_client_secret',
            callbackURL: '/api/auth/google/callback',
            accessType: 'offline', // Request refresh token
            prompt: 'consent'      // Force to get refresh token on re-login
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Check if user exists by googleId or email
                let user = await User.findOne({ 
                    $or: [
                        { googleId: profile.id },
                        { email: profile.emails[0].value }
                    ]
                });

                if (user) {
                    // Update tokens and googleId if they signed up with email first
                    user.googleId = profile.id;
                    user.googleAccessToken = accessToken;
                    if (refreshToken) user.googleRefreshToken = refreshToken;
                    
                    // Update name if missing
                    if (!user.name) user.name = profile.displayName;
                    
                    await user.save();
                    return done(null, user);
                }

                // If not exists, create new user
                user = new User({
                    name: profile.displayName,
                    email: profile.emails[0].value,
                    googleId: profile.id,
                    googleAccessToken: accessToken,
                    googleRefreshToken: refreshToken
                });
                
                await user.save();
                return done(null, user);
            } catch (err) {
                console.error("Passport Google Auth Error:", err);
                return done(err, false);
            }
        }
    )
);

// We won't use session serialization because we issue JWT, but passport might require it for the callback
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
});
