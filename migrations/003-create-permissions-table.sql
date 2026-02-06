CREATE TABLE IF NOT EXISTS permissions (
   permission_id INTEGER PRIMARY KEY AUTOINCREMENT,
   user_id INTEGER NOT NULL,
   group_id INTEGER NOT NULL,
   UNIQUE(user_id, group_id)
);
