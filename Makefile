.PHONY: docs-install docs-serve docs-build

# Live preview of the documentation at http://127.0.0.1:8000
docs-serve:
	mkdocs serve

# Build the docs into ./site (as they are deployed under /docs/ on gh-pages)
docs-build:
	mkdocs build

# Install the docs toolchain (Material for MkDocs)
docs-install:
	pip install -r docs/requirements.txt
