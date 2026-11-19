-- ALTER / DROP demonstration (kept out of schema.sql so the app schema stays clean)
USE EventSystem;
ALTER TABLE Users ADD COLUMN PhoneNumber VARCHAR(15);
ALTER TABLE Users MODIFY COLUMN PhoneNumber VARCHAR(20);
CREATE INDEX idx_user_department ON Users(Department);
ALTER TABLE Users DROP COLUMN PhoneNumber;
DROP INDEX idx_user_department ON Users;
