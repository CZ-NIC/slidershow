.PHONY: all release docs-install docs-serve docs-build

BRANCH := main
VERSION := $(shell awk '/^## [0-9]/{print $$2; exit}' CHANGELOG.md)

all: release

## Tag the version at the top of CHANGELOG.md and push the tag. Run from main only.
release:
	@[ "$$(git branch --show-current)" = "$(BRANCH)" ] || (echo "release must run from $(BRANCH), not $$(git branch --show-current)" && false)
	@git diff --quiet && git diff --cached --quiet || (echo "working tree not clean" && false)
	@git rev-parse "$(VERSION)" >/dev/null 2>&1 && (echo "tag $(VERSION) already exists" && false) || true
	git tag $(VERSION)
	git push origin $(VERSION)

# Live preview of the documentation at http://127.0.0.1:8000
docs-serve:
	mkdocs serve

# Build the docs into ./site (as they are deployed under /docs/ on gh-pages)
docs-build:
	mkdocs build

# Install the docs toolchain (Material for MkDocs)
docs-install:
	pip install -r docs/requirements.txt
