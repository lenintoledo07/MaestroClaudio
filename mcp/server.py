"""Maestro Claudio — MCP server.

Expone herramientas (tools) consumibles por agentes vía Model Context Protocol.
Las herramientas reales (búsqueda en materiales, calendario, tareas, etc.) se
irán añadiendo aquí a medida que se construyan los servicios del backend.
"""

import os

from fastmcp import FastMCP

mcp = FastMCP("maestro-claudio-mcp")

AUTH_TOKEN = os.getenv("MCP_AUTH_TOKEN")
DATABASE_URL = os.getenv("DATABASE_URL")


@mcp.tool()
def health() -> dict:
    """Devuelve el estado del servidor MCP."""
    return {
        "status": "ok",
        "service": "maestro-claudio-mcp",
        "auth_configured": bool(AUTH_TOKEN),
        "database_configured": bool(DATABASE_URL),
    }


@mcp.tool()
def echo(message: str) -> str:
    """Devuelve el mensaje recibido. Útil para validar la conexión MCP."""
    return message


# Ejemplos de tools que se implementarán más adelante:
#
# @mcp.tool()
# async def search_materials(query: str, course_id: str | None = None) -> list[dict]:
#     """Búsqueda semántica sobre los materiales del estudiante (pgvector)."""
#     ...
#
# @mcp.tool()
# async def create_task(title: str, due_at: str, course_id: str | None = None) -> dict:
#     """Crea una tarea de estudio y la sincroniza con Google Calendar."""
#     ...


if __name__ == "__main__":
    # Expone el server por HTTP en el puerto 8002 para que el reverse proxy
    # del VPS (study.denario.cloud/mcp) y otros agentes (Claude.ai, Claude Code)
    # puedan consumirlo. Sin transport="streamable-http" FastMCP corre en stdio
    # y el mapeo 8002:8002 del docker-compose queda colgado.
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8002)
