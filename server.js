const express = require('express');
const session = require('express-session');
const authRoutes = require('./routes');
const db = require('./db');

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(session({
    secret: 'your_secret_key', // Replace with a strong secret
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Connect to the database
db.connect();

// Routes
app.use('/api', authRoutes);

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
