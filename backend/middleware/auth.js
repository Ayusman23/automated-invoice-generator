const jwt = require('jsonwebtoken');

const requireAuth = (req, res, next) => {
    const { authorization } = req.headers;

    if (!authorization) {
        return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authorization.split(' ')[1];

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkey');
        req.user = payload._id; // _id from payload
        next();
    } catch (error) {
        console.error("JWT verification failed:", error.message);
        res.status(401).json({ error: 'Request is not authorized' });
    }
};

module.exports = { requireAuth };
