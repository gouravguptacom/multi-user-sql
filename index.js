const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const DB_FOLDER = path.join(__dirname, "db");

// Ensure DB folder exists
if (!fs.existsSync(DB_FOLDER)) {
  fs.mkdirSync(DB_FOLDER);
}

// Basic query validator
function isSafeQuery(query) {
  const forbidden = ["DROP", "DELETE"]; // "UPDATE", "INSERT", "ALTER"
  const upperQuery = query.toUpperCase();

  return !forbidden.some(word => upperQuery.includes(word));
}

// Get DB connection per user
function getUserDB(userId) {
  const dbPath = path.join(DB_FOLDER, `user_${userId}.sqlite`);

  const db = new sqlite3.Database(dbPath);

  // db.run(`
  //   CREATE TABLE IF NOT EXISTS Customers (
  //     id INTEGER PRIMARY KEY AUTOINCREMENT,
  //     name TEXT
  //   )
  // `);

  return db;
}

// API
app.post("/query", (req, res) => {
  const { userId, query } = req.body;

  if (!userId || !query) {
    return res.status(400).json({ error: "userId and query required" });
  }

  // Check query safety
  if (!isSafeQuery(query)) {
    return res.status(403).json({
      error: "DROP, DELETE queries are not allowed"
    });
  }

  const db = getUserDB(userId);

  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json({
      userId,
      data: rows
    });
  });

  db.close();
});

// Start server
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});