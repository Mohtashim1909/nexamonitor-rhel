from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    APP_NAME: str = "NexaMonitor"
    VERSION: str = "1.0.0"
    DEBUG: bool = True
    DATABASE_URL: str = "sqlite:///./nexamonitor.db"
    DOCKER_HOST: str = "unix:///var/run/docker.sock"
    DOCKER_TIMEOUT: int = 5
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]
    SECRET_KEY: str = "nexamonitor-secret-key-change-in-production"

    class Config:
        env_file = ".env"


settings = Settings()
