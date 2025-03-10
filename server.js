const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const cors = require('cors'); // Add this line

const app = express();
const port = 3000;

// MySQL connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '2142',
    database: 'job_portal'
});

db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to MySQL Database.');
});

// Middleware
app.use(cors()); // Add this line
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Route to handle registration
app.post('/register', (req, res) => {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
        return res.status(400).send('All fields are required.');
    }

    const user = { fullName, email, password };
    const sql = 'INSERT INTO users SET ?';

    db.query(sql, user, (err, result) => {
        if (err) {
            return res.status(500).send('Error saving user to database.');
        }
        res.send('User registered successfully.');
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});