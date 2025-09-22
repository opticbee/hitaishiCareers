const express = require('express');
const admin = require('firebase-admin');
const router = express.Router();

router.post('/register', async (req, res) => {
    const { idToken } = req.body;

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { name, picture, email } = decodedToken;

        // Here, you can save the user to your own database if needed
        // For now, we'll just create a session

        req.session.user = {
            name,
            email,
            picture
        };

        res.status(200).json({ message: 'User signed in successfully.' });
    } catch (error) {
        console.error('Error verifying ID token:', error);
        res.status(401).json({ error: 'Unauthorized' });
    }
});

module.exports = router;
