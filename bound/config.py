from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    payment_rail: str = Field(default="mock", alias="PAYMENT_RAIL")
    bound_db: Path = Field(default=ROOT / "bound.db", alias="BOUND_DB")
    cart_ttl_seconds: int = Field(default=90, alias="CART_TTL_SECONDS")
    public_base_url: str = Field(default="http://127.0.0.1:8000", alias="PUBLIC_BASE_URL")
    cors_origins: str = Field(default="", alias="CORS_ORIGINS")
    catalog_path: Path = Field(default=ROOT / "data" / "catalog.json")

    def browser_origins(self) -> list[str]:
        origins = [
            "http://127.0.0.1:3000",
            "http://localhost:3000",
        ]
        origins += [part.strip() for part in self.cors_origins.split(",") if part.strip()]
        return list(dict.fromkeys(origins))

    razorpay_key_id: str | None = Field(default=None, alias="RAZORPAY_KEY_ID")
    razorpay_key_secret: str | None = Field(default=None, alias="RAZORPAY_KEY_SECRET")
    razorpay_webhook_secret: str | None = Field(default=None, alias="RAZORPAY_WEBHOOK_SECRET")

    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    groq_api_key: str | None = Field(default=None, alias="GROQ_API_KEY")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")

    @property
    def rail_name(self) -> str:
        return (self.payment_rail or "mock").strip().lower()


def get_settings() -> Settings:
    return Settings()
