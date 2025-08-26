-- MySQL Database Setup Script for Anti-Scraping Application
-- Run this script to create the database and user

-- Create database
CREATE DATABASE IF NOT EXISTS webscrap
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

-- Create user (optional - you can use root or existing user)
-- CREATE USER IF NOT EXISTS 'prevent_scraping_user'@'localhost' IDENTIFIED BY 'secure_password_123';

-- Grant privileges
-- GRANT ALL PRIVILEGES ON prevent_scraping.* TO 'prevent_scraping_user'@'localhost';

-- Use the database
USE webscrap;

-- Flush privileges
FLUSH PRIVILEGES;

-- Show databases to confirm
SHOW DATABASES;
