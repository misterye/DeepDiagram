import os
from dotenv import load_dotenv

load_dotenv()

def _env(key: str, default: str = "") -> str:
    """Get env var with whitespace stripped (prevents \\r\\n issues from Windows-created secrets)."""
    return os.getenv(key, default).strip()

class Settings:
    PROJECT_NAME: str = "DeepDiagram"
    API_V1_STR: str = "/api/v1"
    # CORS
    # BACKEND_CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000", "*"]
    # 改为（替换 your-project 为你的 Cloudflare Pages 项目名，或保留 * 允许所有来源）：
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "https://deepdiagram.pages.dev",     # Cloudflare Pages 默认域名
        "https://diagram.binchat.top",     # 如果有自定义域名
    ]
    
    OPENAI_API_KEY: str = _env("OPENAI_API_KEY")
    OPENAI_BASE_URL: str = _env("OPENAI_BASE_URL", "https://api.openai.com")
    
    # LangSmith / LangChain Tracing (Optional but good for agents)
    LANGCHAIN_TRACING_V2: str = _env("LANGCHAIN_TRACING_V2", "false")
    LANGCHAIN_API_KEY: str = _env("LANGCHAIN_API_KEY")
    
    # DATABASE
    DATABASE_URL: str = _env("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/deepdiagram")

    MAX_TOKENS: int = int(_env("MAX_TOKENS", str(1024*16)))

    # DeepSeek
    DEEPSEEK_API_KEY: str = _env("DEEPSEEK_API_KEY")
    DEEPSEEK_BASE_URL: str = _env("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    
    # Model Selection
    MODEL_ID: str = _env("MODEL_ID")
    
    # Thinking Control
    THINKING_VERBOSITY: str = _env("THINKING_VERBOSITY", "normal") # normal, concise, verbose

settings = Settings()
