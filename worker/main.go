package main

import (
    "database/sql"  // Package untuk bekerja dengan database SQL
    "encoding/json" // Package untuk encoding/decoding JSON
    "log"   // Package untuk logging
    "os"    // Package untuk mengakses sistem operasi
    "time"  // Package untuk menangani waktu

    _ "github.com/lib/pq"   // Import driver PostgreSQL
)

// Struct untuk menyimpan data pekerjaan (job)
type JobData struct {
    Filename string `json:"filename"`   // Field Filename akan dikonversi dari JSON
}

// Struct utama untuk pekerjaan (job)
type Job struct {
    ID        int   // ID pekerjaan
    Status    string    // Status pekerjaan (pending, processing, completed, error)
    Data      JobData   // Data pekerjaan yang berisi filename
    CreatedAt time.Time // Waktu saat pekerjaan dibuat
}

func main() {
    // URL koneksi database PostgreSQL
    dbURL := "postgres://postgres:12082001@localhost:5432/employee_db?sslmode=disable"

    // Buka koneksi ke database
    db, err := sql.Open("postgres", dbURL)
    if err != nil {
        log.Fatal("Error connecting to database:", err)
    }
    defer db.Close()    // Pastikan koneksi ditutup setelah selesai

    // Mengecek koneksi database dengan ping
    err = db.Ping()
    if err != nil {
        log.Fatal("Error pinging database:", err)
    }

    log.Println("Connected to database, starting worker...")

   // Loop utama worker
    for {
        job, err := getNextJob(db)  // Mengambil job berikutnya dari database
        if err != nil {
            log.Println("Error getting next job:", err)
            time.Sleep(5 * time.Second) // Tunggu 5 detik sebelum mencoba lagi
            continue
        }

        
        // Process job
        if job == nil { // Jika tidak ada job tersedia
            time.Sleep(5 * time.Second) // Tunggu 5 detik sebelum mencoba lagi
            continue
        }

        // Memproses pekerjaan
        err = processJob(db, job) 
        if err != nil {
            log.Printf("Error processing job %d: %v\n", job.ID, err)
            updateJobStatus(db, job.ID, "error")    // Jika gagal, ubah status menjadi error
        }
    }
}

// Mengambil pekerjaan yang tersedia dari database
func getNextJob(db *sql.DB) (*Job, error) {
    var job Job
    var dataJSON string // Menyimpan data dalam format JSON

    // Query untuk mengambil satu pekerjaan dengan status 'pending' lalu menguncinya
    err := db.QueryRow(`
        UPDATE job_queue 
        SET status = 'processing', worker_id = $1 
        WHERE id = (
            SELECT id 
            FROM job_queue 
            WHERE status = 'pending' 
            ORDER BY created_at ASC 
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, status, data, created_at
    `, os.Getpid()).Scan(&job.ID, &job.Status, &dataJSON, &job.CreatedAt)

    if err == sql.ErrNoRows {
        return nil, nil // Jika tidak ada pekerjaan, kembalikan nil
    }
    if err != nil {
        return nil, err // Jika ada error lain, kembalikan error
    }

    // Mengonversi data JSON ke struct JobData
    err = json.Unmarshal([]byte(dataJSON), &job.Data)
    if err != nil {
        return nil, err // Kembalikan pekerjaan yang berhasil diambil
    }

    return &job, nil
}

// Memproses pekerjaan yang diambil
func processJob(db *sql.DB, job *Job) error {
    log.Printf("Processing job %d\n", job.ID)
 
    time.Sleep(2 * time.Second)// Simulasi pemrosesan selama 2 detik

    return updateJobStatus(db, job.ID, "completed")// Perbarui status menjadi completed
}

// Memperbarui status pekerjaan di database
func updateJobStatus(db *sql.DB, jobID int, status string) error {
    _, err := db.Exec(`
        UPDATE job_queue 
        SET status = $1, processed_at = CURRENT_TIMESTAMP 
        WHERE id = $2
    `, status, jobID)
    return err  // Kembalikan error jika ada
}