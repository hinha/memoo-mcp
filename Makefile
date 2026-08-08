# memoo-mcp — local run & test helpers
# Usage: make help

.PHONY: help install build typecheck lint test test-coverage check stdio serve serve-prod clean dist release

NODE ?= node
NPM  ?= npm

# Extra CLI flags, e.g.:
#   make stdio ARGS='--memo-namespace my-ns --timeout 600s'
ARGS ?=

help:
	@echo "memoo-mcp targets:"
	@echo "  make install         npm install"
	@echo "  make build           tsc → dist/"
	@echo "  make typecheck       tsc --noEmit"
	@echo "  make lint            biome check"
	@echo "  make test            unit tests (mocked fetch)"
	@echo "  make test-coverage   unit tests + c8 (fail <75%)"
	@echo "  make check           typecheck + lint + coverage + warn90"
	@echo "  make stdio           run MCP over stdio (needs MEMOO_API_KEY + namespace)"
	@echo "  make serve           Streamable HTTP on 127.0.0.1:8787/mcp"
	@echo "  make serve-prod      HTTP via dist/ (build first)"
	@echo "  make release VERSION=x.y.z  bump package.json, commit, tag vX.Y.Z, push"
	@echo "  make clean           remove dist/ and coverage/"
	@echo ""
	@echo "Examples:"
	@echo "  make install && make check"
	@echo "  make stdio ARGS='--memoo-base-url https://memoo.hinha.web.id --memo-namespace <uuid> --timeout 600s'"
	@echo "  make release VERSION=1.0.1"

install:
	$(NPM) install

build:
	$(NPM) run build

typecheck:
	$(NPM) run typecheck

lint:
	$(NPM) run lint

test:
	$(NPM) test

test-coverage:
	$(NPM) run test:coverage

check:
	$(NPM) run check

stdio:
	$(NPM) run stdio -- $(ARGS)

serve:
	$(NPM) run serve -- $(ARGS)

serve-prod: build
	$(NPM) run serve:prod -- $(ARGS)

clean:
	rm -rf dist coverage

# Tag is source of truth for npm publish (release.yml syncs package.json from tag).
# Usage: make release VERSION=1.2.3
release:
	@if [ -z "$(VERSION)" ]; then echo "Usage: make release VERSION=x.y.z"; exit 1; fi
	@if ! echo "$(VERSION)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([.-].*)?$$'; then echo "Invalid VERSION=$(VERSION)"; exit 1; fi
	$(NPM) version "$(VERSION)" --no-git-tag-version
	git add package.json package-lock.json
	git commit -m "chore: release v$(VERSION)"
	git tag -a "v$(VERSION)" -m "v$(VERSION)"
	@echo "Created tag v$(VERSION). Push with: git push && git push origin v$(VERSION)"
