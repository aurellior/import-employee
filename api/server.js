// Mengimpor modul yang diperlukan
require("dotenv").config(); // Memuat variabel lingkungan dari file .env
const express = require("express"); // Mengimpor Express.js untuk membuat server
const multer = require("multer"); // Mengimpor Multer untuk menangani upload file
const { Pool } = require("pg"); // Mengimpor modul PostgreSQL untuk koneksi database
const fs = require("fs"); // Mengimpor modul File System untuk mengelola file
const path = require("path"); // Mengimpor modul Path untuk mengelola path file dan direktori
const { parse } = require("csv-parse"); // Mengimpor modul CSV parser untuk membaca file CSV

// Membuat instance Express
const app = express();
const port = process.env.PORT || 3000; // Menggunakan port dari environment atau default 3000

// Middleware untuk menangani request
app.use(express.json()); // Middleware untuk membaca request dalam format JSON

// Menyediakan file statis dari folder public
app.use(express.static(path.join(__dirname, "../public")));

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER || "postgres", // Menggunakan username dari environment atau default "postgres"
  host: process.env.DB_HOST || "localhost", // Menggunakan host dari environment atau default "localhost"
  database: process.env.DB_NAME || "employee_db", // Menggunakan nama database dari environment atau default "employee_db"
  password: process.env.DB_PASSWORD || "your_password", // Menggunakan password dari environment atau default "your_password"
  port: process.env.DB_PORT || 5432, // Menggunakan port database dari environment atau default 5432
});

// Test database connection
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("Error connecting to database:", err);
  } else {
    console.log("Connected to database at:", res.rows[0].now);
  }
});

// Konfigurasi penyimpanan file dengan Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "uploads"); // Menentukan direktori penyimpanan file
    cb(null, uploadDir); // Menentukan folder tujuan penyimpanan file
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`); // Menyimpan file dengan nama unik (timestamp + nama asli)
  },
});

// Mengatur upload file dengan filter hanya menerima file CSV
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "text/csv" && !file.name?.endsWith(".csv")) {
      return cb(new Error("Only CSV files are allowed")); // Validasi hanya menerima file CSV
    }
    cb(null, true); // Jika valid, lanjutkan upload
  },
});

// Endpoint untuk upload file CSV
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" }); // Validasi jika tidak ada file yang diupload
    }

    // Menyimpan informasi pekerjaan dalam job_queue
    const result = await pool.query(
      "INSERT INTO job_queue (status, data) VALUES ($1, $2) RETURNING id",
      ["pending", { filename: req.file.filename }]
    );

    const jobId = result.rows[0].id; // Mengambil ID job yang baru dibuat

    // Memproses CSV di latar belakang
    processCSV(req.file.path, jobId);

    res.json({
      message: "File uploaded successfully",
      jobId: jobId,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to process upload" });
  }
});

// API endpoint untuk cek status upload
app.get("/api/status/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await pool.query(
      "SELECT status, processed_at FROM job_queue WHERE id = $1",
      [jobId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Menghitung progres pemrosesan
    const totalRows = await pool.query(
      "SELECT COUNT(*) FROM employees WHERE job_id = $1",
      [jobId]
    );

    const progress =
      result.rows[0].status === "completed"
        ? 100
        : result.rows[0].status === "processing"
        ? Math.min(99, Math.floor(totalRows.rows[0].count / 100))
        : 0;

    res.json({
      status: result.rows[0].status,
      progress: progress,
      processed_at: result.rows[0].processed_at,
    });
  } catch (error) {
    console.error("Status check error:", error);
    res.status(500).json({ error: "Failed to check status" });
  }
});

// API Endpoint untuk mengambil data karyawan dengan pagination
app.get("/api/employees", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Mengambil total jumlah data karyawan
    const countResult = await pool.query("SELECT COUNT(*) FROM employees");
    const totalItems = parseInt(countResult.rows[0].count);

    // Mengambil data karyawan sesuai halaman dan limit
    const result = await pool.query(
      `SELECT nama, nik, jenis_kelamin, alamat, divisi, jabatan 
       FROM employees 
       ORDER BY id DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Response
    res.json({
      status: "success",
      data: result.rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
        totalItems,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Fungsi untuk memproses file CSV dan memasukkan data ke database
async function processCSV(filePath, jobId) {
  try {
    await pool.query("UPDATE job_queue SET status = $1 WHERE id = $2", [
      "processing",
      jobId,
    ]);

    const fileContent = fs.readFileSync(filePath, "utf-8");

    const parser = fs.createReadStream(filePath).pipe(
      parse({
        columns: (headers) => {
          console.log("Headers asli:", headers);
          return headers.map((h) => {
            console.log("Header sebelum trim:", h, "panjang:", h.length);
            const cleaned = h.trim();
            console.log(
              "Header setelah trim:",
              cleaned,
              "panjang:",
              cleaned.length
            );
            return cleaned;
          });
        },
        skip_empty_lines: true,
        delimiter: ";",
        trim: true,
      })
    );

    for await (const row of parser) {
      console.log("Row yang dibaca:", row);
      console.log("Keys dari row:", Object.keys(row));
      console.log("Values dari row:", Object.values(row));

      // Masukkan data ke database
      const queryValues = [
        row["nama"],
        row["nik"],
        row["jenis_kelamin"],
        row["alamat"],
        row["divisi"],
        row["jabatan"],
        jobId,
      ];

      console.log("Nilai yang akan dimasukkan ke database:", queryValues);

      await pool.query(
        `INSERT INTO employees 
        (nama, nik, jenis_kelamin, alamat, divisi, jabatan, job_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        queryValues
      );
    }

    await pool.query(
      "UPDATE job_queue SET status = $1, processed_at = CURRENT_TIMESTAMP WHERE id = $2",
      ["completed", jobId]
    );

    fs.unlinkSync(filePath);
  } catch (error) {
    console.error("Error saat memproses:", error);
    await pool.query(
      "UPDATE job_queue SET status = $1, processed_at = CURRENT_TIMESTAMP WHERE id = $2",
      ["error", jobId]
    );
  }
}

// Menjalankan server pada port yang ditentukan
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
