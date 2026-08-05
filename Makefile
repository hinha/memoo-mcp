# memoo-mcp — local run & test helpers
# Usage: make help

.PHONY: help install build typecheck test check stdio serve serve-prod clean dist

NODE ?= node
NPM  ?= npm

# Extra CLI flags, e.g.:
#   make stdio ARGS='--memo-namespace my-ns --timeout 600s'
ARGS ?=

help:
	@echo "memoo-mcp targets:"
	@echo "  make install      npm install"
	@echo "  make build        tsc → dist/"
	@echo "  make typecheck    tsc --noEmit"
	@echo "  make test         unit tests (mocked fetch)"
	@echo "  make check        typecheck + test"
	@echo "  make stdio        run MCP over stdio (needs MEMOO_API_KEY + namespace)"
	@echo "  make serve        Streamable HTTP on 127.0.0.1:8787/mcp"
	@echo "  make serve-prod   HTTP via dist/ (build first)"
	@echo "  make clean        remove dist/"
	@echo ""
	@echo "Examples:"
	@echo "  make install && make check"
	@echo "  make stdio ARGS='--memoo-base-url https://memoo.hinha.web.id --memo-namespace <uuid> --timeout 600s'"
	@echo "  make serve"

install:
	$(NPM) install

build:
	$(NPM) run build

typecheck:
	$(NPM) run typecheck

test:
	$(NPM) test

check: typecheck test

stdio:
	$(NPM) run stdio -- $(ARGS)

serve:
	$(NPM) run serve -- $(ARGS)

serve-prod: build
	$(NPM) run serve:prod -- $(ARGS)

clean:
	rm -rf dist
