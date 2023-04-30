const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { open } = require("sqlite");
const path = require("path");
const databasePath = path.join(__dirname, "medicine.db");
const sqlite3 = require("sqlite3").verbose();
const cron = require("node-cron");
const bcrypt = require("bcrypt");
const app = express();
const jwt = require("jsonwebtoken");
const port = 3000;
const istOffset = 330 * 60 * 1000; // IST offset in milliseconds
let database = null;
app.use(cors());
app.use(bodyParser.json());

// Connect to SQLite
const initializeAndDbAndServer = async () => {
  try {
    database = await open({ filename: databasePath, driver: sqlite3.Database });
    const createTableQuery = `
      DELETE FROM today_medicine;
    `;
    await database.run(createTableQuery);
    app.listen(3000, () => {
      console.log(`server is running on http://localhost:3000`);
    });
  } catch (error) {
    console.log(`Database error is ${error}`);
    process.exit(1);
  }
};
initializeAndDbAndServer();

// Define medicine table

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserQuery = `select * from user where username = '${username}';`;
  const checkUserQueryResponse = await database.get(checkUserQuery);
  console.log(checkUserQueryResponse);
  if (checkUserQueryResponse !== undefined) {
    console.log("success");
    const isPasswordMatched = await bcrypt.compare(
      password,
      checkUserQueryResponse.password
    );
    if (isPasswordMatched) {
      console.log("success2");
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "secretkey");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }

  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "secretkey", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// Handle POST requests to add medicine and its dosage to the database
app.post("/medicine", authenticateToken, async (req, res) => {
  const { name, dosage, username } = req.body;
  const sql = `
    INSERT INTO medicine (name, dosage, username)
    VALUES (?, ?, ?)
  `;
  database.run(sql, [name, dosage, username], (err) => {
    if (err) {
      console.error(err.message);
      res.sendStatus(500);
    } else {
      res.sendStatus(201);
    }
  });
});

app.get("/medicines", authenticateToken, async (req, res) => {
  const { username } = req.body;
  const sql = `select * from medicine where username = '${username}';`;
  const sqlResponse = await database.all(sql);
  res.send(sqlResponse);
});

app.get("/", (req, res) => {
  res.send("hello");
});

cron.schedule("0 7 * * *", async () => {
  const currentDate = new Date(Date.now() + istOffset)
    .toISOString()
    .split("T")[0];

  try {
    // Copy data from medicine table and insert into today_medicine table
    await database.run(`INSERT INTO today_medicine (name, dosage, username, created_at)
                         SELECT name, dosage, username, '${currentDate}' FROM medicine`);
    console.log(
      `Data copied from medicine table to today_medicine table for ${currentDate}`
    );
  } catch (error) {
    console.error(
      `Error copying data from medicine table to today_medicine table: ${error}`
    );
  }
});

app.delete("/today_medicine/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const sql = `DELETE FROM today_medicine WHERE id = ${id}`;
  await database.run(sql);
});

app.delete("/medicine/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const sql = `DELETE FROM medicine WHERE id = ${id}`;
  await database.run(sql);
});
