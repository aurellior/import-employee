CREATE TABLE job_queue (
    id SERIAL PRIMARY KEY,
    status VARCHAR(50),
    data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    worker_id VARCHAR(50)
);

CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    nama VARCHAR(100),
    nik VARCHAR(50),
    jenis_kelamin VARCHAR(20),
    alamat TEXT,
    divisi VARCHAR(100),
    jabatan VARCHAR(100),
    job_id INTEGER REFERENCES job_queue(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);