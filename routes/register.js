// register.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { query } = require('../db'); // Your database connection helper
const router = express.Router();

const saltRounds = 10; // For password hashing

// --- Ensure 'uploads' directory exists ---
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// --- Multer Setup for File Uploads ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- Allow JSON & URL-encoded parsing for non-file routes ---
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// --- Database Table Setup ---
const setupDatabaseTable = async () => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            mobile_number VARCHAR(20),
            password_hash VARCHAR(255),
            profile_image_url VARCHAR(255),
            google_id VARCHAR(255) UNIQUE,
            auth_provider VARCHAR(50) NOT NULL DEFAULT 'local',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    try {
        await query(createTableQuery);
        console.log("Database 'users' table is set up and ready.");

        // --- Alter table to add/modify columns, ignoring 'duplicate column' errors ---
        const alterQueries = [
            // "ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE",
            // "ALTER TABLE users ADD COLUMN auth_provider VARCHAR(50) NOT NULL DEFAULT 'local'",
            "ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL",
            "ALTER TABLE users MODIFY COLUMN mobile_number VARCHAR(20) NULL"
        ];

        for (const alterQuery of alterQueries) {
            try {
                await query(alterQuery);
            } catch (error) {
                // MySQL error code for "Duplicate column name" is 1060.
                // We can safely ignore this error, as it means the column already exists.
                // MySQL error code for "Duplicate key name" is 1061 (for UNIQUE constraints).
                if (error.errno !== 1060 && error.errno !== 1061) {
                    // If it's a different error, we should log it and potentially stop.
                    console.error(`Error executing alter query: "${alterQuery}"`, error);
                    throw error; // Rethrow if it's a critical error
                }
            }
        }
        
    } catch (error) {
        // This will catch critical errors from the initial create table or rethrown alter errors.
        console.error("Fatal Error: Could not set up database table.", error);
        process.exit(1);
    }
};
setupDatabaseTable();

// --- Registration API Endpoint ---
router.post('/user/register', upload.single('profileImage'), async (req, res) => {
    try {
        const { fullName, email, mobileNumber, password } = req.body;
        const profileImageUrl = req.file ? `/uploads/${req.file.filename}` : null;

        if (!fullName || !email || !mobileNumber || !password) {
            return res.status(400).json({ error: 'All fields except profile image are required.' });
        }
        
        const existingUser = await query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
             if (existingUser[0].auth_provider === 'google') {
                return res.status(409).json({ error: 'This email was used to sign up with Google. Please log in with Google.' });
            }
            return res.status(409).json({ error: 'This email address is already registered.' });
        }

        const passwordHash = await bcrypt.hash(password, saltRounds);

        const insertUserQuery = `
            INSERT INTO users (full_name, email, mobile_number, password_hash, profile_image_url, auth_provider)
            VALUES (?, ?, ?, ?, ?, ?);
        `;

        const result = await query(insertUserQuery, [
            fullName,
            email,
            mobileNumber,
            passwordHash,
            profileImageUrl,
            'local' // auth_provider
        ]);

        console.log(`✅ User registered successfully with ID: ${result.insertId}`);
        res.status(201).json({
            message: 'User registered successfully!',
            userId: result.insertId
        });

    } catch (error) {
        console.error('❌ Error during registration:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'This email address is already registered.' });
        }
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

// --- Login Route ---
router.post('/user/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const fetchUserQuery = `SELECT * FROM users WHERE email = ?;`;
        const users = await query(fetchUserQuery, [email]);

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = users[0];

        if (user.auth_provider === 'google') {
            return res.status(403).json({ error: 'This account was registered with Google. Please use Google to log in.' });
        }
        
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        req.session.user = {
            id: user.id,
            fullName: user.full_name,
            email: user.email
        };

        res.status(200).json({ message: 'Login successful!' });

    } catch (error) {
        console.error('❌ Error during login:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});

// password update route (without old password check)
router.post('/user/update-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        if (!email || !newPassword) {
            return res.status(400).json({ error: 'Email and new password are required.' });
        }

        // Fetch user by email
        const users = await query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const user = users[0];

        // Block password updates for Google accounts
        if (user.auth_provider === 'google') {
            return res.status(403).json({ error: 'This account was registered with Google. Password update is not applicable.' });
        }

        // Hash the new password
        const newHashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update in DB
        await query('UPDATE users SET password_hash = ? WHERE email = ?', [newHashedPassword, email]);

        res.status(200).json({ message: 'Password updated successfully.' });

    } catch (error) {
        console.error('❌ Error during password update:', error);
        res.status(500).json({ error: 'An error occurred on the server.' });
    }
});


// --- Logout Route ---
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('❌ Error during logout:', err);
            return res.status(500).json({ error: 'Could not log out. Please try again.' });
        }
        res.clearCookie('connect.sid');
        res.status(200).json({ message: 'Logout successful!' });
    });
});

module.exports = router;

