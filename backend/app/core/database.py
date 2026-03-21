from sqlmodel import SQLModel, create_engine
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
import ssl as ssl_module

# Strip sslmode/ssl from URL if present (handled via connect_args instead)
db_url = settings.DATABASE_URL.strip()
for param in ["?sslmode=require", "&sslmode=require", "?ssl=require", "&ssl=require"]:
    db_url = db_url.replace(param, "")

# Use SSL if connecting to a remote database (not localhost)
is_remote = "localhost" not in db_url and "127.0.0.1" not in db_url
connect_args = {"ssl": "require"} if is_remote else {}

engine = create_async_engine(db_url, echo=True, future=True, connect_args=connect_args)

from app.core.migrations import run_migrations

async def init_db():
    async with engine.begin() as conn:
        # await conn.run_sync(SQLModel.metadata.drop_all)
        await conn.run_sync(SQLModel.metadata.create_all)
        await run_migrations(conn)

async def get_session() -> AsyncSession:
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session() as session:
        yield session
