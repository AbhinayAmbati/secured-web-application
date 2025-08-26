import mysql from 'mysql2/promise';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'abhinay@28aa',
  database: process.env.DB_NAME || 'webscrap',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

class Database {
  constructor() {
    this.pool = null;
  }

  async connect() {
    try {
      this.pool = mysql.createPool(dbConfig);

      // Test the connection
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();

      console.log('Connected to MySQL database');
    } catch (error) {
      console.error('Failed to connect to MySQL:', error);
      throw error;
    }
  }

  async run(sql, params = []) {
    try {
      // Use query for DDL statements (CREATE, ALTER, etc.) and execute for DML
      if (sql.trim().toUpperCase().startsWith('CREATE') ||
          sql.trim().toUpperCase().startsWith('ALTER') ||
          sql.trim().toUpperCase().startsWith('DROP') ||
          sql.trim().toUpperCase().startsWith('USE')) {
        const [result] = await this.pool.query(sql, params);
        return {
          id: result.insertId,
          changes: result.affectedRows,
          result
        };
      } else {
        const [result] = await this.pool.execute(sql, params);
        return {
          id: result.insertId,
          changes: result.affectedRows,
          result
        };
      }
    } catch (error) {
      console.error('Database run error:', error);
      throw error;
    }
  }

  async get(sql, params = []) {
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows[0] || null;
    } catch (error) {
      console.error('Database get error:', error);
      throw error;
    }
  }

  async all(sql, params = []) {
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (error) {
      console.error('Database all error:', error);
      throw error;
    }
  }

  async close() {
    try {
      if (this.pool) {
        await this.pool.end();
        console.log('Database connection pool closed');
      }
    } catch (error) {
      console.error('Error closing database:', error);
      throw error;
    }
  }
}

const database = new Database();

export async function initDatabase() {
  await database.connect();

  // Note: Database should be created manually or exist already
  // The connection config already specifies the database name

  // Create users table
  await database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      login_attempts INT DEFAULT 0,
      locked_until TIMESTAMP NULL,
      is_active BOOLEAN DEFAULT TRUE,
      INDEX idx_users_email (email),
      INDEX idx_users_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Create device_keys table for storing user device public keys
  await database.run(`
    CREATE TABLE IF NOT EXISTS device_keys (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      key_id VARCHAR(255) UNIQUE NOT NULL,
      public_key_jwk TEXT NOT NULL,
      fingerprint_hash TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT TRUE,
      INDEX idx_device_keys_user_id (user_id),
      INDEX idx_device_keys_key_id (key_id),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Create refresh_tokens table
  await database.run(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash VARCHAR(255) NOT NULL,
      device_key_id INT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_revoked BOOLEAN DEFAULT FALSE,
      INDEX idx_refresh_tokens_user_id (user_id),
      INDEX idx_refresh_tokens_token_hash (token_hash),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (device_key_id) REFERENCES device_keys (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Create posts table for CRUD operations
  await database.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_posts_user_id (user_id),
      INDEX idx_posts_created_at (created_at),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Create request_logs table for monitoring and rate limiting
  await database.run(`
    CREATE TABLE IF NOT EXISTS request_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      ip_address VARCHAR(45),
      user_agent TEXT,
      endpoint VARCHAR(255),
      method VARCHAR(10),
      status_code INT,
      fingerprint_hash TEXT,
      dpop_jti VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_request_logs_user_id (user_id),
      INDEX idx_request_logs_ip (ip_address),
      INDEX idx_request_logs_created_at (created_at),
      INDEX idx_request_logs_endpoint (endpoint),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Update existing columns to handle longer fingerprint data
  try {
    await database.run(`ALTER TABLE device_keys MODIFY COLUMN fingerprint_hash TEXT`);
    await database.run(`ALTER TABLE request_logs MODIFY COLUMN fingerprint_hash TEXT`);
    console.log('Database schema updated for fingerprint_hash columns');
  } catch (error) {
    // Ignore errors if columns are already the correct type
    console.log('Fingerprint hash columns already updated or error occurred:', error.message);
  }

  console.log('MySQL database tables created successfully');
}

export { database };
