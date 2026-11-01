from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_exp_minutes: int = 30
    redis_url: str | None = None
    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:3000"]
    admin_email: str | None = None
    admin_name: str = "Admin"
    admin_password: SecretStr | None = Field(default=None, min_length=8, max_length=128)


settings = Settings()
