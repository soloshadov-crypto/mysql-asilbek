import mysql from "mysql2/promise";

// Ulanish ma'lumotlari faqat Environment variables'dan olinadi.
const REQUIRED_ENV = ["DB_HOST", "DB_USER", "DB_PASS", "DB_NAME"];

function getConfig() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    const err = new Error(`Environment variables topilmadi: ${missing.join(", ")}`);
    err.code = "ENV_MISSING";
    throw err;
  }
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 4000), // TiDB Cloud porti
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    // TiDB Cloud SSL talab qiladi (TLSv1.2+)
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectTimeout: 10000,
  };
}

let tableReady = false;

async function ensureTable(db) {
  if (tableReady) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS notes (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  tableReady = true;
}

export default async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return Response.json({ error: "Faqat GET va POST so'rovlari qabul qilinadi" }, { status: 405 });
  }

  let name;
  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Noto'g'ri so'rov (JSON kutilgan)" }, { status: 400 });
    }
    name = String(body?.name ?? "").trim().slice(0, 100);
    if (!name) {
      return Response.json({ error: "Ism bo'sh bo'lmasligi kerak" }, { status: 400 });
    }
  }

  let db;
  try {
    db = await mysql.createConnection(getConfig());
  } catch (err) {
    console.error("DB ulanish xatosi:", err.code || "", err.message);
    return Response.json(
      { error: "Bazaga ulanib bo'lmadi", detail: err.code || "UNKNOWN" },
      { status: 500 }
    );
  }

  try {
    await ensureTable(db);

    let saved = false;
    if (name) {
      await db.execute("INSERT INTO notes (name) VALUES (?)", [name]);
      saved = true;
    }

    const [rows] = await db.execute(
      "SELECT name, created_at FROM notes ORDER BY id DESC LIMIT 50"
    );
    return Response.json({ ok: true, saved, rows });
  } catch (err) {
    console.error("DB so'rov xatosi:", err.code || "", err.message);
    return Response.json(
      { error: "Bazada xatolik yuz berdi", detail: err.code || "UNKNOWN" },
      { status: 500 }
    );
  } finally {
    await db.end().catch(() => {});
  }
};
