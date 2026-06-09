"""Local dev entrypoint: python run.py  (or: uvicorn app.main:app --reload --port 5001)"""

import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.environ.get("FLASK_HOST", "127.0.0.1"),
        port=int(os.environ.get("FLASK_PORT", "5001")),
        reload=True,
    )
