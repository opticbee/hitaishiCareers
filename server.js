const express = require('express');
const session = require('express-session');
const path = require('path');
const registerRoute = require('./routes/register');
const db = require('./db');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Serve static files from root folder
app.use(express.static(path.join(__dirname)));

// API routes
app.use('/register', registerRoute);

// Catch-all route for frontend
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(port, '0.0.0.0', () => {
    console.log(`HitaishiCareers server running on port ${port}...`);
});
