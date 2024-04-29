//userController.js

const pool = require('./dbConfig');
const bcrypt = require('bcryptjs');
const JWT = require('jsonwebtoken');

// Define the userController object
const userController = {};


userController.register = async (req, res) => {
    console.log('Register function called');

    //Extract user data from request body
    const { email, nickname, password } = req.body;

    console.log('User data:', { email, nickname, password });

    //Validate user input
    if (!email || !password || !nickname) {
        return res.status(400).send({ error: 'Invalid email or password'});
    }

    try {
        const encryptedPassword = await bcrypt.hash(password, 10);
        console.log('Hashed Password:', encryptedPassword);

        //Insert user data into the databse
        await pool.query(
            'INSERT INTO users (email, password, nickname) VALUES ($1, $2, $3)',
            [email, encryptedPassword, nickname]
          )

          console.log('User registered successfully');

        res.status(201).send({ message: 'User registered successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Internal server error' });
    }
};

userController.login = async (req, res) => {
    console.log('Login function called');
    // Extract user data from request body
    const { email, password } = req.body;

    console.log('User data:', { email, password });

    // Validate user input
    if (!email || !password) {
        return res.status(400).send({ error: 'Invalid email or password'});
    }

    try {
        const q = await pool.query(
            'SELECT password, id, nickname from users WHERE email=$1',
            [email]
        );

        if (q.rowCount === 0) {
            return res.status(404).send({ error: 'This user does not exist' });
        }

        const result = q.rows[0];

        const match = await bcrypt.compare(password, result.password);

        if (!match) {
            return res.status(403).send({ error: 'Wrong password' });
        }

        // Sign JWT token
        const token = await JWT.sign(
            { id: result.id, nickname: result.nickname, email },
            process.env.JWT_SECRET,
            {
                algorithm: 'HS512',
            }
        );

        // Send the token as response
        res.send({ token });
    } catch (error) {
        console.error('Error logging in user:', error);
        // Send a generic error response
        res.status(500).send({ error: 'Internal server error' });
    }
};


userController.createLobby = async (req, res) => {
    console.log('Received create lobby request');

    const name = req.body.name;
    const description = req.body.description;
    const email = req.body.email;

    try {
        // Retrieve user ID based on the email
        console.log('Querying database for user ID');
        const userIdQuery = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
        
        // Check if the query returned any rows
        if (userIdQuery.rows.length === 0) {
            console.log('User not found');
            return res.status(404).json({ error: 'User not found' });
        }

        // Extract the user ID from the query result
        const userId = userIdQuery.rows[0].id;
        console.log('User ID:', userId);

        // Insert new lobby into the database
        console.log('Inserting new lobby into the database');
        const query = 'INSERT INTO lobbies (name, description, admin_user_id) VALUES ($1, $2, $3) RETURNING lobby_id';
        const values = [name, description, userId];
        const result = await pool.query(query, values);

        const lobbyId = result.rows[0].lobby_id;
        console.log('Lobby ID:', lobbyId);

        // Sendlobby creation  the response
        console.log('Sending response');
        return res.status(201).json({ message: 'Lobby created successfully', lobby_id: lobbyId });
    } catch (error) {
        console.error('Error creating lobby:', error);
        // Send the error response
        return res.status(500).json({ error: 'Internal server error' });
    }
};

userController.postMessageLobby = async (req, res) => {
    try {
        const { content, lobby_id } = req.body;

        const queryResult = await pool.query('INSERT INTO messages (content, user_id, lobby_id) VALUES ($1, $2, $3) RETURNING *', [content, req.user.id, lobby_id]);

        res.status(201).json({ message: 'Message posted successfully', data: queryResult.rows[0] });
    } catch (error) {
        console.error('Error posting message:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


// Function to fetch messages for a specific lobby with pagination
userController.viewMessageLobby = async (req, res) => {
    try {
        const email = req.body.email;

        // Retrieve user ID based on the email
        const userQuery = 'SELECT id FROM users WHERE email = $1';
        const userResult = await pool.query(userQuery, [email]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userId = userResult.rows[0].id;

        // Retrieve lobby ID for the user
        const lobbyQuery = 'SELECT DISTINCT lobby_id FROM messages WHERE user_id = $1';
        const lobbyResult = await pool.query(lobbyQuery, [userId]);

        if (lobbyResult.rows.length === 0) {
            return res.status(404).json({ error: 'User is not a member of any lobby' });
        }

        const lobbyId = lobbyResult.rows[0].lobby_id;

        // Pagination parameters
        const page = req.query.page || 1; // Current page number
        const pageSize = 10; // Number of items per page
        const offset = (page - 1) * pageSize; // Calculate offset

        // Retrieve messages for the lobby with pagination
        const messageQuery = `
            SELECT * FROM messages
            WHERE lobby_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `;
        const messageResult = await pool.query(messageQuery, [lobbyId, pageSize, offset]);
        const messages = messageResult.rows;

        // Count total number of messages in the lobby
        const countQuery = 'SELECT COUNT(*) AS total FROM messages WHERE lobby_id = $1';
        const countResult = await pool.query(countQuery, [lobbyId]);
        const totalMessages = countResult.rows[0].total;

        // Calculate total number of pages
        const totalPages = Math.ceil(totalMessages / pageSize);

        // Send response with pagination information
        res.status(200).json({
            messages,
            currentPage: page,
            totalPages,
            pageSize
        });
    } catch (error) {
        console.error('Error retrieving messages:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// 1. define the function
userController.editMessageLobby = async (req, res) => {
    try {
        // Extract the message ID from the URL parameters
        const message_id = req.params.message_id;
        // Retrieve the email address from the request body
        const email = req.body.email;
        // Retrieve the new content from the request body
        const newContent = req.body.newContent;

        console.log('Message ID:', message_id);
        console.log('User Email:', email);
        console.log('New Content:', newContent);

        // Retrieve the user ID based on the email address
        const userQuery = 'SELECT id FROM users WHERE email = $1';
        const userResult = await pool.query(userQuery, [email]);

        console.log('User Query Result:', userResult.rows);

        // Check if the user exists
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Extract the user ID from the query result
        const user_id = userResult.rows[0].id;

        console.log('User ID:', user_id);

        // Check if the message exists and belongs to the user
        const messageQuery = 'SELECT * FROM messages WHERE message_id = $1 AND user_id = $2';
        const messageResult = await pool.query(messageQuery, [message_id, user_id]);

        console.log('Message Query Result:', messageResult.rows);

        // Check if the message exists and belongs to the user
        if (messageResult.rows.length === 0) {
            return res.status(404).json({ error: 'Message not found or does not belong to the user' });
        }

        // Update the message content in the database
        await pool.query('UPDATE messages SET content = $1 WHERE message_id = $2', [newContent, message_id]);

        console.log('Message updated successfully');

        res.status(200).json({ message: 'Message updated successfully' });
    } catch (error) {
        console.error('Error editing message:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


userController.deleteMessageInLobby = async (req, res) => {
    const message_id = req.body.message_id;
    const email = req.body.email;
    const lobby_id = req.body.lobby_id;

    try {
        console.log(typeof lobby_id);
        console.log('Received lobbyId:', lobby_id);

        // Convert lobbyId from UUID string to integer
        const convertedLobby_id = parseInt(lobby_id, 10);

        // Check if the conversion was successful
        if (isNaN(convertedLobby_id)) {
            throw new Error('Invalid lobbyId received');
        }

        const lobbyQuery = await pool.query('SELECT admin_user_id FROM lobbies WHERE lobby_id = $1', [convertedLobby_id]);
        const adminUserId = lobbyQuery.rows[0].admin_user_id;

        // Retrieve the user ID based on the email
        const userIdQuery = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
        const userId = userIdQuery.rows[0].id;

        // Check if the user is an admin for the lobby
        if (String(userId) === String(adminUserId)) {
            // Perform message deletion
            await pool.query('DELETE FROM messages WHERE message_id = $1 AND lobby_id = $2', [message_id, convertedLobby_id]);
            res.status(200).json({ message: 'Message deleted successfully' });
        } else {
            // User is not authorized to delete the message
            res.status(403).json({ error: 'Unauthorized: You are not allowed to delete this message' });
        }

    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


userController.editMessageByAdmin = async (req, res) => {
    const message_id = req.body.message_id;
    const newContent = req.body.newContent;
    const admin_user_id = req.body.admin_user_id;

    try {
        // Check if the user is an admin for the specified lobby
        const lobbyQuery = await pool.query('SELECT admin_user_id FROM lobbies WHERE lobby_id = (SELECT lobby_id FROM messages WHERE message_id = $1)', [message_id]);
        
        // Verify that the query returned rows
        if (lobbyQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        const adminIdFromDb = lobbyQuery.rows[0].admin_user_id;

        // Verify that the user is an admin
        if (admin_user_id !== adminIdFromDb) {
            return res.status(403).json({ error: 'Unauthorized: You are not allowed to edit messages in this lobby' });
        }

        // Update the message content
        await pool.query('UPDATE messages SET content = $1 WHERE message_id = $2', [newContent, message_id]);
        
        res.status(200).json({ message: 'Message edited successfully' });
    } catch (error) {
        console.error('Error editing message:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


module.exports = userController;