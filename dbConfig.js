// dbConfig.js

const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: 'lockerroomproject',
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});


module.exports = pool;