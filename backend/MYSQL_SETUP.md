# MySQL Setup Guide

This guide will help you set up MySQL for the Anti-Scraping application.

## Prerequisites

1. **Install MySQL Server**
   - Download from: https://dev.mysql.com/downloads/mysql/
   - Or use package manager:
     ```bash
     # Windows (using Chocolatey)
     choco install mysql
     
     # macOS (using Homebrew)
     brew install mysql
     
     # Ubuntu/Debian
     sudo apt update
     sudo apt install mysql-server
     
     # CentOS/RHEL
     sudo yum install mysql-server
     ```

2. **Start MySQL Service**
   ```bash
   # Windows
   net start mysql
   
   # macOS/Linux
   sudo systemctl start mysql
   # or
   sudo service mysql start
   ```

## Database Setup

### Option 1: Using MySQL Command Line

1. **Connect to MySQL**
   ```bash
   mysql -u root -p
   ```

2. **Run the setup script**
   ```sql
   source setup-mysql.sql;
   ```

### Option 2: Manual Setup

1. **Connect to MySQL**
   ```bash
   mysql -u root -p
   ```

2. **Create database**
   ```sql
   CREATE DATABASE IF NOT EXISTS prevent_scraping 
   CHARACTER SET utf8mb4 
   COLLATE utf8mb4_unicode_ci;
   ```

3. **Create user (optional but recommended for production)**
   ```sql
   CREATE USER IF NOT EXISTS 'prevent_scraping_user'@'localhost' 
   IDENTIFIED BY 'secure_password_123';
   
   GRANT ALL PRIVILEGES ON prevent_scraping.* 
   TO 'prevent_scraping_user'@'localhost';
   
   FLUSH PRIVILEGES;
   ```

4. **Use the database**
   ```sql
   USE prevent_scraping;
   ```

## Environment Configuration

Update your `.env` file with the correct database credentials:

```env
# Database Configuration (MySQL)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=prevent_scraping
DB_USER=root
DB_PASSWORD=your_mysql_root_password

# For production, use a dedicated user:
# DB_USER=prevent_scraping_user
# DB_PASSWORD=secure_password_123
```

## Testing the Connection

1. **Start the backend server**
   ```bash
   npm run dev
   ```

2. **Check the console output**
   You should see:
   ```
   Connected to MySQL database
   MySQL database tables created successfully
   Server running on port 3001
   ```

## Troubleshooting

### Common Issues

**"Access denied for user"**
- Check your username and password in `.env`
- Make sure MySQL service is running
- Verify user has proper permissions

**"Database does not exist"**
- Run the setup script or create database manually
- Check database name in `.env` matches created database

**"Connection refused"**
- Ensure MySQL service is running
- Check host and port in `.env`
- Verify firewall settings

**"Too many connections"**
- Increase MySQL max_connections setting
- Check for connection leaks in application

### MySQL Configuration

For better performance, consider these MySQL settings in `my.cnf` or `my.ini`:

```ini
[mysqld]
# Connection settings
max_connections = 200
wait_timeout = 28800
interactive_timeout = 28800

# Character set
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci

# Performance
innodb_buffer_pool_size = 256M
innodb_log_file_size = 64M
query_cache_size = 32M
```

## Security Recommendations

1. **Use a dedicated database user**
   - Don't use root for application connections
   - Grant only necessary privileges

2. **Strong passwords**
   - Use complex passwords for database users
   - Store credentials securely

3. **Network security**
   - Bind MySQL to localhost if not using remote connections
   - Use SSL/TLS for remote connections
   - Configure firewall rules

4. **Regular maintenance**
   - Keep MySQL updated
   - Monitor logs for suspicious activity
   - Regular backups

## Backup and Restore

### Create Backup
```bash
mysqldump -u root -p prevent_scraping > backup.sql
```

### Restore Backup
```bash
mysql -u root -p prevent_scraping < backup.sql
```

## Migration from SQLite

If you're migrating from the SQLite version:

1. **Export data from SQLite** (if you have existing data)
2. **Set up MySQL** using this guide
3. **Update environment variables**
4. **Start the application** - tables will be created automatically
5. **Import data** if needed

The application will automatically create all necessary tables when it starts with the MySQL configuration.
