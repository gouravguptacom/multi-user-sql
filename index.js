const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const fsp = require("fs/promises");
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

async function runQuery(db, query) {
  return new Promise((resolve, reject) => {
    const results = [];

    db.serialize(() => {
      const statements = query.split(";").map(q => q.trim()).filter(Boolean);

      let pending = statements.length;
      if (pending === 0) return resolve({ results: [] });

      statements.forEach((stmt, index) => {
        if (stmt.toUpperCase().startsWith("SELECT")) {
          db.all(stmt, [], (err, rows) => {
            if (err) return reject(err);
            results[index] = {
              type: "select",
              rows
            };
            if (--pending === 0) resolve({ results });
          });
        } else {
          db.run(stmt, function (err) {
            if (err) return reject(err);
            results[index] = {
              type: "mutation",
              changes: this.changes,
              lastID: this.lastID
            };
            if (--pending === 0) resolve({ results });
          });
        }
      });
    });
  });
}

async function checkFile(filePath) { 
  try { 
    await fsp.access(filePath); 
    return true;
  } catch { 
    return false;
  } 
}

async function resetFile(filePath) {
  await removeFileIfPresent(filePath);
  await fsp.writeFile(filePath, '');
}

async function removeFileIfPresent(filePath) {
  try {
    await fsp.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

question_solution = `
  DELETE FROM Employees
`;

question_pre_query = `
  DROP TABLE IF EXISTS Employees;
  CREATE TABLE Employees (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR(255), age INT);
  INSERT INTO Employees (name, age) VALUES ('Gaurav', 27), ('Kittu', 20);
`;

app.post("/reset", async (req, res) => {
  const { qid } = req.body;
  
  const dbPath = path.join(DB_FOLDER, `user_${qid}.sqlite`);
  await resetFile(dbPath);

  const db = new sqlite3.Database(dbPath);
  db.exec(question_pre_query, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }

    db.close();
    res.json({ ok: "Pre Query Executed" });
  });
});

app.post("/execute", async (req, res) => {
  const { query, qid } = req.body;

  const dbPath = path.join(DB_FOLDER, `user_${qid}.sqlite`);
  const file_exists = await checkFile(dbPath);

  let db = null;

  if (!file_exists) {
    await resetFile(dbPath);

    db = new sqlite3.Database(dbPath);
    
    await new Promise((resolve, reject) => {
      db.exec(question_pre_query, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  if (!db) db = new sqlite3.Database(dbPath);
  let response = await runQuery(db, query);

  db.close();

  res.send(response);
});

app.post("/submit", async (req, res) => {
  const { query, qid } = req.body;

  const runsPath = path.join(DB_FOLDER, `uid_${qid}_${Date.now()}.runs.sqlite`);
  const testPath = path.join(DB_FOLDER, `uid_${qid}_${Date.now()}.test.sqlite`);
  
  await resetFile(runsPath);
  await resetFile(testPath);
  
  const runs_db = new sqlite3.Database(runsPath);
  const test_db = new sqlite3.Database(testPath);

  // these pre query first need to run on both db
  runs_db.exec(question_pre_query, (err) => { if (err) { console.error(err) } });
  test_db.exec(question_pre_query, (err) => { if (err) { console.error(err) } });

  try {
    const runs_res = await runQuery(runs_db, question_solution);
    const test_res = await runQuery(test_db, query);

    runs_db.close();
    test_db.close();

    // delete these fils afterwards
    await removeFileIfPresent(runsPath);
    await removeFileIfPresent(testPath);

    res.json({
      runs_res,
      test_res
    });
  } catch (e) {
    res.json({ error: e?.message });
  }
});

// Start server
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});