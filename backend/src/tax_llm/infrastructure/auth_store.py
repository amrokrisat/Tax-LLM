from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from pathlib import Path
from uuid import uuid4

from tax_llm.domain.models import SessionRecord, UserRecord
from tax_llm.infrastructure.database import connect_db, resolve_db_path
from tax_llm.infrastructure.matter_store import utc_now_iso


class AuthStore:
    def __init__(self, base_dir: Path | None = None) -> None:
        self.db_path = resolve_db_path(base_dir)
        self._initialize()
        self._migrate_legacy_json(base_dir)

    def create_user(self, email: str, password: str, name: str) -> UserRecord:
        normalized_email = email.strip().lower()
        if self._get_user_by_email(normalized_email):
            raise ValueError("An account already exists for this email address.")

        timestamp = utc_now_iso()
        user = UserRecord(
            user_id=str(uuid4()),
            email=normalized_email,
            password_hash=self._hash_password(password),
            name=name.strip() or normalized_email.split("@")[0],
            created_at=timestamp,
            updated_at=timestamp,
        )
        with connect_db(self.db_path) as connection:
            connection.execute(
                """
                INSERT INTO users (user_id, email, password_hash, name, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    user.user_id,
                    user.email,
                    user.password_hash,
                    user.name,
                    user.created_at,
                    user.updated_at,
                ),
            )
        return user

    def authenticate(self, email: str, password: str) -> UserRecord | None:
        user = self._get_user_by_email(email.strip().lower())
        if not user or not self._verify_password(password, user.password_hash):
            return None
        return user

    def create_or_update_google_user(self, email: str, name: str) -> UserRecord:
        normalized_email = email.strip().lower()
        user = self._get_user_by_email(normalized_email)
        timestamp = utc_now_iso()

        if user:
            updated = user.model_copy(update={"name": name.strip() or user.name, "updated_at": timestamp})
            with connect_db(self.db_path) as connection:
                connection.execute(
                    "UPDATE users SET name = ?, updated_at = ? WHERE user_id = ?",
                    (updated.name, updated.updated_at, updated.user_id),
                )
            return updated

        user = UserRecord(
            user_id=str(uuid4()),
            email=normalized_email,
            password_hash="",
            name=name.strip() or normalized_email.split("@")[0],
            created_at=timestamp,
            updated_at=timestamp,
        )
        with connect_db(self.db_path) as connection:
            connection.execute(
                """
                INSERT INTO users (user_id, email, password_hash, name, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    user.user_id,
                    user.email,
                    user.password_hash,
                    user.name,
                    user.created_at,
                    user.updated_at,
                ),
            )
        return user

    def create_session(self, user_id: str) -> SessionRecord:
        session = SessionRecord(
            session_token=secrets.token_urlsafe(32),
            user_id=user_id,
            created_at=utc_now_iso(),
        )
        with connect_db(self.db_path) as connection:
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
            connection.execute(
                "INSERT INTO sessions (session_token, user_id, created_at) VALUES (?, ?, ?)",
                (session.session_token, session.user_id, session.created_at),
            )
        return session

    def get_user_for_session(self, session_token: str) -> UserRecord | None:
        with connect_db(self.db_path) as connection:
            row = connection.execute(
                """
                SELECT u.user_id, u.email, u.password_hash, u.name, u.created_at, u.updated_at
                FROM sessions s
                JOIN users u ON u.user_id = s.user_id
                WHERE s.session_token = ?
                """,
                (session_token,),
            ).fetchone()
        return UserRecord.model_validate(dict(row)) if row else None

    def delete_session(self, session_token: str) -> None:
        with connect_db(self.db_path) as connection:
            connection.execute("DELETE FROM sessions WHERE session_token = ?", (session_token,))

    def _get_user_by_email(self, email: str) -> UserRecord | None:
        with connect_db(self.db_path) as connection:
            row = connection.execute(
                """
                SELECT user_id, email, password_hash, name, created_at, updated_at
                FROM users
                WHERE email = ?
                """,
                (email,),
            ).fetchone()
        return UserRecord.model_validate(dict(row)) if row else None

    def _initialize(self) -> None:
        with connect_db(self.db_path) as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    session_token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL
                );
                """
            )

    def _migrate_legacy_json(self, base_dir: Path | None) -> None:
        legacy_dir = None
        if base_dir and base_dir.suffix != ".db":
            legacy_dir = base_dir
        elif base_dir is None:
            legacy_dir = self.db_path.parent / "auth"
        if not legacy_dir or not legacy_dir.exists():
            return

        users_path = legacy_dir / "users.json"
        sessions_path = legacy_dir / "sessions.json"

        with connect_db(self.db_path) as connection:
            user_count = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            session_count = connection.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]

            if user_count == 0 and users_path.exists():
                payload = json.loads(users_path.read_text(encoding="utf-8"))
                for item in payload:
                    user = UserRecord.model_validate(item)
                    connection.execute(
                        """
                        INSERT OR IGNORE INTO users (user_id, email, password_hash, name, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            user.user_id,
                            user.email,
                            user.password_hash,
                            user.name,
                            user.created_at,
                            user.updated_at,
                        ),
                    )

            if session_count == 0 and sessions_path.exists():
                payload = json.loads(sessions_path.read_text(encoding="utf-8"))
                for item in payload:
                    session = SessionRecord.model_validate(item)
                    connection.execute(
                        """
                        INSERT OR IGNORE INTO sessions (session_token, user_id, created_at)
                        VALUES (?, ?, ?)
                        """,
                        (session.session_token, session.user_id, session.created_at),
                    )

    def _hash_password(self, password: str) -> str:
        salt = secrets.token_hex(16)
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            200_000,
        ).hex()
        return f"{salt}${derived}"

    def _verify_password(self, password: str, stored_hash: str) -> bool:
        if not stored_hash:
            return False
        salt, digest = stored_hash.split("$", maxsplit=1)
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            200_000,
        ).hex()
        return hmac.compare_digest(derived, digest)

