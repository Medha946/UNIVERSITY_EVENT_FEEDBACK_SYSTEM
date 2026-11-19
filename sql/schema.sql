-- ============================================================
-- University Event & Feedback System : relational schema (MySQL 8)
-- 3NF design. Run: mysql -u root -p < sql/schema.sql
-- ============================================================
CREATE DATABASE IF NOT EXISTS EventSystem;
USE EventSystem;

-- Drop in reverse dependency order (DROP demonstration + re-runnable script)
DROP VIEW  IF EXISTS EventRoster;
DROP VIEW  IF EXISTS EventOccupancy;
DROP TABLE IF EXISTS EventAuditLog;
DROP TABLE IF EXISTS Registrations;
DROP TABLE IF EXISTS Events;
DROP TABLE IF EXISTS Categories;
DROP TABLE IF EXISTS Users;

CREATE TABLE Users (
    UserID        INT AUTO_INCREMENT PRIMARY KEY,
    Name          VARCHAR(100) NOT NULL,
    Email         VARCHAR(150) NOT NULL UNIQUE,
    PasswordHash  VARCHAR(255) NOT NULL,            -- bcrypt hash, never plain text
    Role          ENUM('Admin','Student') NOT NULL DEFAULT 'Student',
    Department    VARCHAR(60) NULL,
    CreatedAt     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_user_email CHECK (Email LIKE '%_@_%._%'),
    CONSTRAINT chk_user_name  CHECK (CHAR_LENGTH(TRIM(Name)) >= 2)
);

-- Categories split out of Events so category names are not repeated (3NF)
CREATE TABLE Categories (
    CategoryID    INT AUTO_INCREMENT PRIMARY KEY,
    CategoryName  VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE Events (
    EventID       INT AUTO_INCREMENT PRIMARY KEY,
    Title         VARCHAR(200) NOT NULL,
    Description   TEXT,
    Venue         VARCHAR(100) NOT NULL,
    EventDate     DATE NOT NULL,
    Capacity      INT NOT NULL,
    CategoryID    INT NOT NULL,
    OrganizerID   INT NULL,
    CONSTRAINT chk_event_capacity CHECK (Capacity > 0),
    CONSTRAINT fk_event_category  FOREIGN KEY (CategoryID)  REFERENCES Categories(CategoryID) ON DELETE RESTRICT,
    -- SET NULL (not CASCADE): removing an organizer account must not wipe the events
    CONSTRAINT fk_event_organizer FOREIGN KEY (OrganizerID) REFERENCES Users(UserID) ON DELETE SET NULL,
    INDEX idx_event_date (EventDate),
    INDEX idx_event_category (CategoryID),
    FULLTEXT INDEX ft_event_search (Title, Description)
);

CREATE TABLE Registrations (
    RegID     INT AUTO_INCREMENT PRIMARY KEY,
    UserID    INT NOT NULL,
    EventID   INT NOT NULL,
    RegDate   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_event UNIQUE (UserID, EventID),   -- no double registration
    CONSTRAINT fk_registration_user  FOREIGN KEY (UserID)  REFERENCES Users(UserID)   ON DELETE CASCADE,
    CONSTRAINT fk_registration_event FOREIGN KEY (EventID) REFERENCES Events(EventID) ON DELETE CASCADE,
    INDEX idx_registration_event (EventID)
);

-- Written by triggers; deliberately has no FKs so history survives deletions
CREATE TABLE EventAuditLog (
    LogID     INT AUTO_INCREMENT PRIMARY KEY,
    EventID   INT NOT NULL,
    UserID    INT NOT NULL,
    Action    ENUM('REGISTER','CANCEL') NOT NULL,
    LoggedAt  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_event (EventID)
);

-- ---------- Views ----------
CREATE VIEW EventRoster AS
SELECT e.EventID, r.RegID, e.Title AS EventName, e.EventDate,
       u.UserID, u.Name AS StudentName, u.Email AS ContactInfo, r.RegDate
FROM Events e
JOIN Registrations r ON e.EventID = r.EventID
JOIN Users u ON r.UserID = u.UserID;

CREATE VIEW EventOccupancy AS
SELECT e.EventID, e.Title, e.EventDate, e.Capacity,
       COUNT(r.RegID) AS Registered,
       e.Capacity - COUNT(r.RegID) AS SeatsLeft,
       ROUND(100 * COUNT(r.RegID) / e.Capacity, 1) AS FillPct
FROM Events e
LEFT JOIN Registrations r ON r.EventID = e.EventID
GROUP BY e.EventID, e.Title, e.EventDate, e.Capacity;
