//server.js

const pg = require('pg');
const express = require('express');
const dotenv = require('dotenv');
const userController = require('./userController');
const JWT = require('jsonwebtoken');

const { Pool } = pg;

dotenv.config(); // Load environment variables from .env file

const app = express();
const PORT = process.env.PORT || 3004; // Set port from environment variable or use 3000 by default

// Middleware to parse request bodies
app.use(express.json());

// Middleware to log request details
app.use((req, res, next) => {
    console.log('Request headers:', req.headers);
    next();
});

// Import the authenticateToken function
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).send('Unauthorized');

    JWT.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error('Error decoding token:', err);
            return res.status(403).send('Invalid token');
        } 
        console.log('Decoded token:', user);
        req.user = user;
        next();
    });
};


// Default route
app.get('/', (req, res) => {
    res.send('Welcome to the Sports Club API!');
});

// Registration new user
app.post('/api/register', (req, res) => {
    console.log('Received registration request');
    // Call the register function from userController.js
    userController.register(req, res);
});

// Login an existing user
app.post('/api/login', userController.login);


// Apply authenticateToken middleware to protected routes
app.post('/api/protected-route', authenticateToken, (req, res) => {
    res.send('Access granted!');
});

// Middleware to parse request bodies and handle token authentication
// Middleware to parse request bodies and handle token authentication
app.use(async (req, res, next) => {
    console.log(`Incoming ${req.method} request to ${req.originalUrl}`);
    console.log('Request headers:', req.headers);
    console.log('Request body:', req.body);

    // Check if authorization header is present
    if (!req.headers.authorization) return res.status(401).send('Unauthorized');

    try {
        // Verify JWT token
        const decoded = await JWT.verify(
            req.headers.authorization.split(' ')[1],
            process.env.JWT_SECRET
        );

        // If token is valid, set user information in request object
        if (decoded !== undefined) {
            req.user = decoded;
            return next(); // Move to the next middleware/route handler
        }
    } catch (err) {
        console.log(err);
    }

    // If token is invalid, send 403 Forbidden response
    return res.status(403).send('Invalid token');
});


// Routes requiring authentication
app.post('/api/lobby/create', authenticateToken, userController.createLobby);
app.post('/api/lobby/postMessage', authenticateToken, userController.postMessageLobby);
app.post('/api/lobby/viewMessage', authenticateToken, userController.viewMessageLobby);
app.post('/api/lobby/editMessage/:message_id', authenticateToken, userController.editMessageLobby);
app.delete('/api/lobby/deleteMessage', authenticateToken, express.json(), userController.deleteMessageInLobby);
app.post('/api/lobby/editMessageAdmin', authenticateToken, userController.editMessageByAdmin);


// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Internal Server Error');
});


// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});
