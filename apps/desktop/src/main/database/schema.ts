export const SCHEMA_VERSION = 8

export const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS home_widgets (
  id TEXT PRIMARY KEY,
  widget_id TEXT NOT NULL,
  position_index INTEGER NOT NULL DEFAULT 0,
  x INTEGER NOT NULL DEFAULT 0,
  y INTEGER NOT NULL DEFAULT 0,
  w INTEGER NOT NULL DEFAULT 3,
  h INTEGER NOT NULL DEFAULT 2,
  config_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  kind TEXT NOT NULL UNIQUE,
  capabilities TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  external_account_id TEXT NOT NULL,
  label TEXT NOT NULL,
  email_address TEXT,
  display_name TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  setup_status TEXT NOT NULL DEFAULT 'connected' CHECK(setup_status IN ('draft', 'pending_setup', 'connected', 'error')),
  settings_json TEXT,
  last_sync_at TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider_id, external_account_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  external_conversation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT,
  last_message_preview TEXT,
  last_message_at TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  is_muted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider_id, account_id, external_conversation_id)
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  external_participant_id TEXT,
  display_name TEXT,
  address TEXT,
  role TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  external_message_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
  sender_name TEXT,
  sender_address TEXT,
  body_plain TEXT,
  body_html TEXT,
  body_preview TEXT,
  received_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider_id, account_id, external_message_id)
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  external_attachment_id TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  byte_size INTEGER,
  local_path TEXT,
  content_id TEXT,
  download_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_cursors (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  cursor_value TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider_id, account_id, scope)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  level TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS local_message_states (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK(state IN ('unread', 'read', 'archived', 'snoozed', 'pinned')),
  snoozed_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(message_id, state)
);

CREATE TABLE IF NOT EXISTS message_reactions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  external_user_id TEXT NOT NULL,
  is_self INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(message_id, name, external_user_id)
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  recurrence_json TEXT NOT NULL,
  next_occurrence_at TEXT NOT NULL,
  last_fired_at TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS browser_spaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  partition_key TEXT NOT NULL UNIQUE,
  ad_block INTEGER NOT NULL DEFAULT 0,
  position_index INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS browser_bookmark_categories (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES browser_spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS browser_bookmarks (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES browser_spaces(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES browser_bookmark_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  favicon_url TEXT,
  position_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS browser_history (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES browser_spaces(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  favicon_url TEXT,
  visit_count INTEGER NOT NULL DEFAULT 1,
  first_visited_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_visited_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(space_id, url)
);

CREATE TABLE IF NOT EXISTS browser_tab_groups (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES browser_spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  position_index INTEGER NOT NULL DEFAULT 0,
  is_collapsed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS browser_tabs (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES browser_spaces(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES browser_tab_groups(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  title TEXT,
  custom_title TEXT,
  favicon_url TEXT,
  position_index INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0,
  last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS browser_extensions (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  version TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Gestionnaire de mots de passe : mot de passe chiffre via safeStorage (password_b64),
-- jamais stocke en clair. Cle (origine, login) -> un identifiant par compte et par site.
CREATE TABLE IF NOT EXISTS browser_credentials (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  username TEXT NOT NULL,
  password_b64 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(origin, username)
);

CREATE INDEX IF NOT EXISTS idx_accounts_provider_id ON accounts(provider_id);
CREATE INDEX IF NOT EXISTS idx_conversations_account_id ON conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_sync_cursors_account_scope ON sync_cursors(account_id, scope);
CREATE INDEX IF NOT EXISTS idx_home_widgets_position ON home_widgets(position_index);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(is_enabled, next_occurrence_at);
CREATE INDEX IF NOT EXISTS idx_browser_spaces_position ON browser_spaces(position_index);
CREATE INDEX IF NOT EXISTS idx_browser_categories_space ON browser_bookmark_categories(space_id, position_index);
CREATE INDEX IF NOT EXISTS idx_browser_bookmarks_space ON browser_bookmarks(space_id, position_index);
CREATE INDEX IF NOT EXISTS idx_browser_bookmarks_category ON browser_bookmarks(category_id, position_index);
CREATE INDEX IF NOT EXISTS idx_browser_history_space_recent ON browser_history(space_id, last_visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_browser_history_space_visits ON browser_history(space_id, visit_count DESC);
CREATE INDEX IF NOT EXISTS idx_browser_tabs_space ON browser_tabs(space_id, position_index);
CREATE INDEX IF NOT EXISTS idx_browser_tab_groups_space ON browser_tab_groups(space_id, position_index);
CREATE INDEX IF NOT EXISTS idx_browser_credentials_origin ON browser_credentials(origin);

CREATE TABLE IF NOT EXISTS account_secrets (
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  token_kind TEXT NOT NULL,
  secret_b64 TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, provider_id, token_kind)
);

-- Omnipass : coffre de mots de passe zero-knowledge. La cle de chiffrement est derivee du mot
-- de passe maitre (jamais stocke) ; tous les champs sensibles sont chiffres en AES-256-GCM par
-- cette cle, en plus du chiffrement au repos de la base. Le trousseau OS ne suffit donc PAS a
-- lire le contenu : sans le mot de passe maitre, les colonnes *_enc sont illisibles.
CREATE TABLE IF NOT EXISTS pass_vault (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  kdf_salt TEXT NOT NULL,
  kdf_params TEXT NOT NULL,
  verifier_b64 TEXT NOT NULL,
  biometric_wrapped_b64 TEXT,
  recovery_salt TEXT,
  recovery_params TEXT,
  recovery_wrapped_b64 TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pass_folders (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES pass_folders(id) ON DELETE CASCADE,
  name_enc TEXT NOT NULL,
  icon TEXT,
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pass_entries (
  id TEXT PRIMARY KEY,
  folder_id TEXT REFERENCES pass_folders(id) ON DELETE SET NULL,
  title_enc TEXT NOT NULL,
  username_enc TEXT,
  url_enc TEXT,
  password_enc TEXT NOT NULL,
  notes_enc TEXT,
  icon TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  pwd_changed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pass_entries_folder ON pass_entries(folder_id);
CREATE INDEX IF NOT EXISTS idx_pass_folders_parent ON pass_folders(parent_id);

-- Omnichat : contacts dedies et persistants (modele sans annuaire global). user_id =
-- le "hash" (UUID) du pair, stocke en lowercase ; pseudo = libelle saisi localement.
CREATE TABLE IF NOT EXISTS omnichat_contacts (
  user_id TEXT PRIMARY KEY,
  pseudo TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (1), (2), (3), (4), (5), (6), (7), (8);
`

export const migrationSql = `
ALTER TABLE accounts ADD COLUMN setup_status TEXT NOT NULL DEFAULT 'connected';
ALTER TABLE accounts ADD COLUMN settings_json TEXT;
ALTER TABLE conversations ADD COLUMN kind TEXT;
ALTER TABLE messages ADD COLUMN body_tokens TEXT;
ALTER TABLE messages ADD COLUMN is_unread INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN external_uid INTEGER;
ALTER TABLE messages ADD COLUMN folder_path TEXT;
ALTER TABLE attachments ADD COLUMN download_url TEXT;
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS home_widgets (id TEXT PRIMARY KEY, widget_id TEXT NOT NULL, position_index INTEGER NOT NULL DEFAULT 0, x INTEGER NOT NULL DEFAULT 0, y INTEGER NOT NULL DEFAULT 0, w INTEGER NOT NULL DEFAULT 3, h INTEGER NOT NULL DEFAULT 2, config_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
ALTER TABLE home_widgets ADD COLUMN config_json TEXT;
CREATE INDEX IF NOT EXISTS idx_home_widgets_position ON home_widgets(position_index);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(conversation_id, is_unread);
CREATE TABLE IF NOT EXISTS reminders (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT, recurrence_json TEXT NOT NULL, next_occurrence_at TEXT NOT NULL, last_fired_at TEXT, is_enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(is_enabled, next_occurrence_at);
CREATE TABLE IF NOT EXISTS browser_spaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT, color TEXT, partition_key TEXT NOT NULL UNIQUE, ad_block INTEGER NOT NULL DEFAULT 0, position_index INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS browser_bookmark_categories (id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES browser_spaces(id) ON DELETE CASCADE, name TEXT NOT NULL, position_index INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS browser_bookmarks (id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES browser_spaces(id) ON DELETE CASCADE, category_id TEXT REFERENCES browser_bookmark_categories(id) ON DELETE SET NULL, title TEXT NOT NULL, url TEXT NOT NULL, favicon_url TEXT, position_index INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS browser_history (id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES browser_spaces(id) ON DELETE CASCADE, url TEXT NOT NULL, title TEXT, favicon_url TEXT, visit_count INTEGER NOT NULL DEFAULT 1, first_visited_at TEXT NOT NULL DEFAULT (datetime('now')), last_visited_at TEXT NOT NULL DEFAULT (datetime('now')), created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(space_id, url));
CREATE TABLE IF NOT EXISTS browser_tabs (id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES browser_spaces(id) ON DELETE CASCADE, url TEXT NOT NULL, title TEXT, favicon_url TEXT, position_index INTEGER NOT NULL DEFAULT 0, is_pinned INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 0, last_active_at TEXT NOT NULL DEFAULT (datetime('now')), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_browser_spaces_position ON browser_spaces(position_index);
CREATE INDEX IF NOT EXISTS idx_browser_categories_space ON browser_bookmark_categories(space_id, position_index);
CREATE INDEX IF NOT EXISTS idx_browser_bookmarks_space ON browser_bookmarks(space_id, position_index);
CREATE INDEX IF NOT EXISTS idx_browser_bookmarks_category ON browser_bookmarks(category_id, position_index);
CREATE INDEX IF NOT EXISTS idx_browser_history_space_recent ON browser_history(space_id, last_visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_browser_history_space_visits ON browser_history(space_id, visit_count DESC);
CREATE INDEX IF NOT EXISTS idx_browser_tabs_space ON browser_tabs(space_id, position_index);
CREATE TABLE IF NOT EXISTS browser_tab_groups (id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES browser_spaces(id) ON DELETE CASCADE, name TEXT NOT NULL, color TEXT, position_index INTEGER NOT NULL DEFAULT 0, is_collapsed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS browser_extensions (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, version TEXT, is_enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
ALTER TABLE browser_tabs ADD COLUMN group_id TEXT;
ALTER TABLE browser_tabs ADD COLUMN custom_title TEXT;
CREATE INDEX IF NOT EXISTS idx_browser_tab_groups_space ON browser_tab_groups(space_id, position_index);
CREATE INDEX IF NOT EXISTS idx_browser_tabs_group ON browser_tabs(group_id, position_index);
CREATE TABLE IF NOT EXISTS account_secrets (account_id TEXT NOT NULL, provider_id TEXT NOT NULL, token_kind TEXT NOT NULL, secret_b64 TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (account_id, provider_id, token_kind));
ALTER TABLE accounts ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_accounts_position ON accounts(position);
CREATE TABLE IF NOT EXISTS browser_credentials (id TEXT PRIMARY KEY, origin TEXT NOT NULL, username TEXT NOT NULL, password_b64 TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(origin, username));
CREATE INDEX IF NOT EXISTS idx_browser_credentials_origin ON browser_credentials(origin);
CREATE TABLE IF NOT EXISTS omnichat_contacts (user_id TEXT PRIMARY KEY, pseudo TEXT NOT NULL, added_at TEXT NOT NULL DEFAULT (datetime('now')));
ALTER TABLE pass_vault ADD COLUMN biometric_wrapped_b64 TEXT;
ALTER TABLE pass_vault ADD COLUMN recovery_salt TEXT;
ALTER TABLE pass_vault ADD COLUMN recovery_params TEXT;
ALTER TABLE pass_vault ADD COLUMN recovery_wrapped_b64 TEXT;
`
