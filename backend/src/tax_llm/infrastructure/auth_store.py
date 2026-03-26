from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from pathlib import Path
from uuid import uuid4

from tax_llm.domain.models import SessionRecord, UserRecord
from tax_llm.infrastructure.matter_store import utc_now_iso
from tax_llm.infrastructure.paths import backend_data_path


class AuthStore:
    def __init__(self, base_dir: Path | None = None) -> None:
        self.base_dir = base_dir or backend_data_path("auth")
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.users_path = self.base_dir / "users.json"
        self.sessions_path = self.base_dir / "sessions.json"
        self._ensure_files()

    def create_user(self, email: str, password: str, name: str) -> UserRecord:
        normalized_email = email.strip().lower()
        users = self._load_users()
        if any(user.email == normalized_email for user in users):
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
        users.append(user)
        self._save_users(users)
        return user

    def authenticate(self, email: str, password: str) -> UserRecord | None:
        normalized_email = email.strip().lower()
        user = next((item for item in self._load_users() if item.email == normalized_email), None)
        if not user or not self._verify_password(password, user.password_hash):
            return None
        return user

    def create_or_update_google_user(self, email: str, name: str) -> UserRecord:
        normalized_email = email.strip().lower()
        users = self._load_users()
        user = next((item for item in users if item.email == normalized_email), None)
        timestamp = utc_now_iso()

        if user:
            user.name = name.strip() or user.name
            user.updated_at = timestamp
            self._save_users(users)
            return user

        user = UserRecord(
            user_id=str(uuid4()),
            email=normalized_email,
            password_hash="",
            name=name.strip() or normalized_email.split("@")[0],
            created_at=timestamp,
            updated_at=timestamp,
        )
        users.append(user)
        self._save_users(users)
        return user

    def create_session(self, user_id: str) -> SessionRecord:
        sessions = self._load_sessions()
        session = SessionRecord(
            session_token=secrets.token_urlsafe(32),
            user_id=user_id,
            created_at=utc_now_iso(),
        )
        sessions = [existing for existing in sessions if existing.user_id != user_id]
        sessions.append(session)
        self._save_sessions(sessions)
        return session

    def get_user_for_session(self, session_token: str) -> UserRecord | None:
        session = next(
            (item for item in self._load_sessions() if item.session_token == session_token),
            None,
        )
        if not session:
            return None
        return next((user for user in self._load_users() if user.user_id == session.user_id), None)

    def delete_session(self, session_token: str) -> None:
        sessions = [item for item in self._load_sessions() if item.session_token != session_token]
        self._save_sessions(sessions)

    def _ensure_files(self) -> None:
        if not self.users_path.exists():
            self.users_path.write_text("[]", encoding="utf-8")
        if not self.sessions_path.exists():
            self.sessions_path.write_text("[]", encoding="utf-8")

    def _load_users(self) -> list[UserRecord]:
        with self.users_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return [UserRecord.model_validate(item) for item in payload]

    def _save_users(self, users: list[UserRecord]) -> None:
        self.users_path.write_text(
            json.dumps([user.model_dump(mode="json") for user in users], indent=2),
            encoding="utf-8",
        )

    def _load_sessions(self) -> list[SessionRecord]:
        with self.sessions_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return [SessionRecord.model_validate(item) for item in payload]

    def _save_sessions(self, sessions: list[SessionRecord]) -> None:
        self.sessions_path.write_text(
            json.dumps([session.model_dump(mode="json") for session in sessions], indent=2),
            encoding="utf-8",
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
