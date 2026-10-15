"""Test bootstrap: point the runner at an isolated temporary data directory
before the application package is imported anywhere."""
import os
import tempfile

os.environ.setdefault("PLAYGROUND_SEEDS_DIR", "/app/seeds")
os.environ["PLAYGROUND_DATA_DIR"] = tempfile.mkdtemp(prefix="pg-test-data-")
