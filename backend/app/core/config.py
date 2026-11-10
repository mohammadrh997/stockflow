from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    secret_key: str = Field(min_length=32)
    algorithm: str = "HS256"
    access_token_exp_minutes: int = 480
    redis_url: str | None = None
    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:5173"]
    admin_email: str | None = None
    client_ip_header: str | None = None
    admin_name: str = "Admin"
    admin_password: SecretStr | None = Field(default=None, min_length=8, max_length=128)
    # Printed at the top of PDFs; the address may span several lines
    company_name: str = "ClearCypher"
    company_address: str | None = "Karrada, Baghdad, Iraq\n+964 770 000 0000"
    # Product images go to an S3-compatible bucket (Backblaze B2 in the demo).
    storage_endpoint: str | None = None  # e.g. https://s3.us-east-005.backblazeb2.com
    storage_region: str | None = None  # e.g. us-east-005
    storage_bucket: str | None = None
    storage_key_id: str | None = None
    storage_secret_key: SecretStr | None = None
    storage_public_url: str | None = None  # where browsers load images from


settings = Settings()
