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

    # Buyer-agent LLM. Never used for authorization or settlement.
    # The money path (policy / mandates / razorpay_rail / handler) cannot import
    # bound.llm at all — see tests/test_no_llm_on_money_path.py.
    agent_llm: str = Field(default="off", alias="AGENT_LLM")
    aimlapi_key: str | None = Field(default=None, alias="AIMLAPI_API_KEY")
    aimlapi_base_url: str = Field(
        default="https://api.aimlapi.com/v1", alias="AIMLAPI_BASE_URL"
    )
    agent_model: str = Field(default="claude-sonnet-4-5", alias="AGENT_MODEL")
    agent_narrator_model: str = Field(
        default="claude-3-5-haiku-20241022", alias="AGENT_NARRATOR_MODEL"
    )
    agent_llm_timeout: float = Field(default=6.0, alias="AGENT_LLM_TIMEOUT")

    @property
    def rail_name(self) -> str:
        return (self.payment_rail or "mock").strip().lower()

    @property
    def agent_llm_enabled(self) -> bool:
        return (self.agent_llm or "off").strip().lower() in {"on", "true", "1", "yes"}


def get_settings() -> Settings:
    return Settings()
