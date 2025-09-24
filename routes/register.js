// register.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { query } = require('../db'); // Your database connection helper
const router = express.Router();

const saltRounds = 10; // For password hashing

// --- File Upload Setup (using Multer) ---
// Ensure the 'uploads' directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configure how files are stored
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir); // Store files in the 'uploads' folder
    },
    filename: function (req, file, cb) {
        // Create a unique filename to prevent overwrites
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- Database Table Setup ---
// This function creates the 'users' table if it doesn't already exist.
const setupDatabaseTable = async () => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            mobile_number VARCHAR(20) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            profile_image_url VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    try {
        await query(createTableQuery);
        console.log("Database 'users' table is set up and ready.");
    } catch (error) {
        console.error("Fatal Error: Could not set up database table.", error);
        process.exit(1); // Exit if the table can't be created
    }
};

// Run the setup function when the server starts
setupDatabaseTable();

// --- Registration API Endpoint ---
// This handles the POST request from the frontend form.
// 'upload.single('profileImage')' processes the file upload first.
router.post('/user/register', upload.single('profileImage'), async (req, res) => {
    const { fullName, email, mobileNumber, password } = req.body;
    
    // Check if the uploaded file exists
    const profileImageUrl = req.file ? `/${uploadDir}/${req.file.filename}` : null;

    // Validate required fields
    if (!fullName || !email || !mobileNumber || !password) {
        return res.status(400).json({ error: 'All fields except profile image are required.' });
    }

    try {
        // 1. Hash the password for security before storing it
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // 2. Prepare the SQL query to insert data
        const insertUserQuery = `
            INSERT INTO users (full_name, email, mobile_number, password_hash, profile_image_url)
            VALUES (?, ?, ?, ?, ?);
        `;

        // 3. Execute the query with the user's data
        const result = await query(insertUserQuery, [
            fullName,
            email,
            mobileNumber,
            passwordHash,
            profileImageUrl
        ]);

        console.log(`User registered successfully with ID: ${result.insertId}`);
        
        // 4. Send a success response back to the frontend
        res.status(201).json({ 
            message: 'User registered successfully!',
            userId: result.insertId 
        });

    } catch (error) {
        console.error('Error during registration:', error);
        // Handle specific error for duplicate email
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'This email address is already registered.' });
        }
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

// Login Route
router.post('/user/login', async (req, res) => {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        // 1. Fetch the user by email
        const fetchUserQuery = `SELECT * FROM users WHERE email = ?;`;
        const users = await query(fetchUserQuery, [email]);

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = users[0];

        // 2. Compare the provided password with the stored hash
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        // 3. Successful login, create a session
        req.session.user = {
            id: user.id,
            fullName: user.full_name,
            email: user.email
        };

        res.status(200).json({ message: 'Login successful!' });

    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

// Logout Route
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error during logout:', err);
            return res.status(500).json({ error: 'Could not log out. Please try again.' });
        } 
        res.clearCookie('connect.sid'); // Clear the session cookie
        res.status(200).json({ message: 'Logout successful!' });
    });
});

module.exports = router;

