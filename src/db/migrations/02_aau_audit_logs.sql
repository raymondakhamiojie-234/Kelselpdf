CREATE TABLE IF NOT EXISTS curriculum_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    entity_type ENUM('programme', 'course_offering') NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
