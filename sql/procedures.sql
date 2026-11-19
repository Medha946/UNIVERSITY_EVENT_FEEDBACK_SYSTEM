-- ============================================================
-- Stored procedure, function and triggers.
-- CLI usage: mysql -u root -p < sql/procedures.sql
-- ============================================================
USE EventSystem;

DROP PROCEDURE IF EXISTS sp_register_for_event;
DROP FUNCTION  IF EXISTS fn_seats_left;
DROP TRIGGER   IF EXISTS trg_registration_capacity;
DROP TRIGGER   IF EXISTS trg_registration_audit;
DROP TRIGGER   IF EXISTS trg_cancellation_audit;
DROP TRIGGER   IF EXISTS trg_event_capacity_guard;

DELIMITER $$

-- Transaction: lock the event row so two students cannot grab the last seat together
CREATE PROCEDURE sp_register_for_event(IN p_user INT, IN p_event INT, OUT p_status VARCHAR(30))
proc: BEGIN
    DECLARE v_cap   INT DEFAULT NULL;
    DECLARE v_date  DATE;
    DECLARE v_count INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'ERROR';
    END;

    START TRANSACTION;
    SELECT Capacity, EventDate INTO v_cap, v_date
      FROM Events WHERE EventID = p_event FOR UPDATE;

    IF v_cap IS NULL THEN
        ROLLBACK; SET p_status = 'EVENT_NOT_FOUND'; LEAVE proc;
    END IF;
    IF v_date < CURDATE() THEN
        ROLLBACK; SET p_status = 'EVENT_PAST'; LEAVE proc;
    END IF;
    IF EXISTS (SELECT 1 FROM Registrations WHERE UserID = p_user AND EventID = p_event) THEN
        ROLLBACK; SET p_status = 'ALREADY_REGISTERED'; LEAVE proc;
    END IF;

    SELECT COUNT(*) INTO v_count FROM Registrations WHERE EventID = p_event;
    IF v_count >= v_cap THEN
        ROLLBACK; SET p_status = 'EVENT_FULL'; LEAVE proc;
    END IF;

    INSERT INTO Registrations (UserID, EventID) VALUES (p_user, p_event);
    COMMIT;
    SET p_status = 'OK';
END$$

CREATE FUNCTION fn_seats_left(p_event INT) RETURNS INT
READS SQL DATA
BEGIN
    DECLARE v_left INT;
    SELECT e.Capacity - COUNT(r.RegID) INTO v_left
      FROM Events e LEFT JOIN Registrations r ON r.EventID = e.EventID
     WHERE e.EventID = p_event GROUP BY e.EventID, e.Capacity;
    RETURN v_left;
END$$

-- Database-level validation: capacity can never be exceeded, whatever client inserts
CREATE TRIGGER trg_registration_capacity BEFORE INSERT ON Registrations
FOR EACH ROW
BEGIN
    IF (SELECT COUNT(*) FROM Registrations WHERE EventID = NEW.EventID)
       >= (SELECT Capacity FROM Events WHERE EventID = NEW.EventID) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Event is full';
    END IF;
END$$

CREATE TRIGGER trg_registration_audit AFTER INSERT ON Registrations
FOR EACH ROW
BEGIN
    INSERT INTO EventAuditLog (EventID, UserID, Action) VALUES (NEW.EventID, NEW.UserID, 'REGISTER');
END$$

CREATE TRIGGER trg_cancellation_audit AFTER DELETE ON Registrations
FOR EACH ROW
BEGIN
    INSERT INTO EventAuditLog (EventID, UserID, Action) VALUES (OLD.EventID, OLD.UserID, 'CANCEL');
END$$

-- Admin cannot shrink capacity below the number of students already registered
CREATE TRIGGER trg_event_capacity_guard BEFORE UPDATE ON Events
FOR EACH ROW
BEGIN
    IF NEW.Capacity < (SELECT COUNT(*) FROM Registrations WHERE EventID = OLD.EventID) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Capacity cannot be lower than current registrations';
    END IF;
END$$

DELIMITER ;
