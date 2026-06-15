# Makefile dla OmniPort
#
# Projekt buduje aplikacje przez Docker. Lokalnie nie trzeba miec Node.js,
# Go ani Neutralino CLI. Dockerfile sklada frontend, extension Go, paczke
# Neutralino oraz maly launcher, ktory pakuje calosc w jeden plik wykonywalny.
#
# Najczestsze uzycie:
#   make build          # Windows x64, domyslny target
#   make build-linux    # Linux x64
#   make build-mac      # macOS x64
#   make build-all      # Windows x64 + Linux x64 + macOS x64
#
# Artefakty trafiaja do:
#   dist-docker-v<wersja-bez-kropek>/<platforma>/

APP_NAME := omniport

# Wersja jest czytana z package.json, zeby Makefile nie mial osobnej wartosci
# do recznego utrzymywania. Dla 1.0.20 root wyjsciowy bedzie dist-docker-v1020.
VERSION := $(shell sed -n 's/.*"version": "\([^"]*\)".*/\1/p' package.json | head -n 1)
VERSION_TAG := $(subst .,,$(VERSION))

# Root z artefaktami. Mozesz nadpisac:
#   make build DIST_ROOT=out
DIST_ROOT ?= dist/v$(VERSION_TAG)

WINDOWS_DIST_DIR ?= $(DIST_ROOT)/windows-x64
LINUX_DIST_DIR ?= $(DIST_ROOT)/linux-x64
MAC_DIST_DIR ?= $(DIST_ROOT)/mac-x64
MAC_ARM64_DIST_DIR ?= $(DIST_ROOT)/mac-arm64

WINDOWS_OUTPUT := $(WINDOWS_DIST_DIR)/$(APP_NAME)-single.exe
LINUX_OUTPUT := $(LINUX_DIST_DIR)/$(APP_NAME)-single-linux-x64
MAC_OUTPUT := $(MAC_DIST_DIR)/$(APP_NAME)-single-mac-x64
MAC_ARM64_OUTPUT := $(MAC_ARM64_DIST_DIR)/$(APP_NAME)-single-mac-arm64

.PHONY: help build build-all build-windows build-linux build-mac build-mac-x64 build-mac-arm64 prepare-windows-dist prepare-linux-dist prepare-mac-dist prepare-mac-arm64-dist print-version clean

define ensure_output_dir
	@mkdir -p "$(1)" 2>/dev/null || { \
		echo "Brak uprawnien do utworzenia katalogu: $(1)"; \
		echo "Probuje przygotowac ten sam katalog przez sudo, bez zmiany sciezki."; \
		if command -v sudo >/dev/null 2>&1; then \
			sudo mkdir -p "$(1)" && sudo chown -R "$$(id -u):$$(id -g)" "$(DIST_ROOT)"; \
		else \
			echo "Brak sudo. Utworz katalog recznie i nadaj prawa zapisu: $(1)"; \
			exit 1; \
		fi; \
	}
	@test -w "$(1)" || { \
		echo "Katalog istnieje, ale nie jest zapisywalny: $(1)"; \
		echo "Probuje nadac prawa aktualnemu userowi przez sudo."; \
		if command -v sudo >/dev/null 2>&1; then \
			sudo chown -R "$$(id -u):$$(id -g)" "$(DIST_ROOT)"; \
		else \
			echo "Brak sudo. Nadaj prawa zapisu recznie: $(1)"; \
			exit 1; \
		fi; \
	}
endef

# Domyslny target: pokazuje dostepne komendy, zeby przypadkowe `make`
# nie uruchamialo dlugiego builda.
help:
	@echo "OmniPort"
	@echo ""
	@echo "Dostepne komendy:"
	@echo "  make build          Buduje Windows x64 przez Docker"
	@echo "  make build-windows  Buduje Windows x64"
	@echo "  make build-linux    Buduje Linux x64"
	@echo "  make build-mac      Buduje macOS x64"
	@echo "  make build-mac-arm64  Buduje macOS arm64, jesli Neutralino ma runtime mac_arm64"
	@echo "  make build-all      Buduje Windows x64 + Linux x64 + macOS x64"
	@echo "  make print-version  Pokazuje wersje i katalogi wyjsciowe"
	@echo "  make clean          Usuwa katalog wyjsciowy dla aktualnej wersji"
	@echo ""
	@echo "Aktualna wersja:      $(VERSION)"
	@echo "Root wyjsciowy:       $(DIST_ROOT)"
	@echo "Windows artefakt:     $(WINDOWS_OUTPUT)"
	@echo "Linux artefakt:       $(LINUX_OUTPUT)"
	@echo "macOS artefakt:       $(MAC_OUTPUT)"

# Domyslnie `make build` zachowuje dotychczasowe zachowanie: buduje Windows x64.
build: build-windows

# Platformowy build Windows.
# Parametry:
# - TARGET_OS/TARGET_ARCH steruja cross-compilacja extension i launchera Go.
# - NEUTRALINO_PLATFORM wybiera runtime Neutralino z paczki `neu build`.
# - EXTENSION_BINARY musi zgadzac sie z komenda w patchowanym neutralino.config.json.
# - APP_BINARY to nazwa runtime Neutralino po przepakowaniu do payloadu.
# - LAUNCHER_BINARY to finalny pojedynczy plik eksportowany z Dockerfile.
prepare-windows-dist:
	$(call ensure_output_dir,$(WINDOWS_DIST_DIR))

build-windows: prepare-windows-dist
	docker build \
		--build-arg TARGET_OS=windows \
		--build-arg TARGET_ARCH=amd64 \
		--build-arg NEUTRALINO_PLATFORM=win_x64 \
		--build-arg EXTENSION_BINARY=http-extension.exe \
		--build-arg APP_BINARY=$(APP_NAME).exe \
		--build-arg LAUNCHER_BINARY=$(APP_NAME)-single.exe \
		--build-arg LAUNCHER_LDFLAGS="-H windowsgui -s -w" \
		--output type=local,dest=$(WINDOWS_DIST_DIR) .
	@echo ""
	@echo "Gotowe: $(WINDOWS_OUTPUT)"

# Platformowy build Linux x64. Extension i launcher nie maja rozszerzenia .exe.
prepare-linux-dist:
	$(call ensure_output_dir,$(LINUX_DIST_DIR))

build-linux: prepare-linux-dist
	docker build \
		--build-arg TARGET_OS=linux \
		--build-arg TARGET_ARCH=amd64 \
		--build-arg NEUTRALINO_PLATFORM=linux_x64 \
		--build-arg EXTENSION_BINARY=http-extension \
		--build-arg APP_BINARY=$(APP_NAME) \
		--build-arg LAUNCHER_BINARY=$(APP_NAME)-single-linux-x64 \
		--build-arg LAUNCHER_LDFLAGS="-s -w" \
		--output type=local,dest=$(LINUX_DIST_DIR) .
	@echo ""
	@echo "Gotowe: $(LINUX_OUTPUT)"

# Czytelny alias. W razie potrzeby mozna pozniej przestawic go na universal
# albo arm64, bez zmiany nawyku `make build-mac`.
build-mac: build-mac-x64

# Platformowy build macOS x64.
prepare-mac-dist:
	$(call ensure_output_dir,$(MAC_DIST_DIR))

build-mac-x64: prepare-mac-dist
	docker build \
		--build-arg TARGET_OS=darwin \
		--build-arg TARGET_ARCH=amd64 \
		--build-arg NEUTRALINO_PLATFORM=mac_x64 \
		--build-arg EXTENSION_BINARY=http-extension \
		--build-arg APP_BINARY=$(APP_NAME) \
		--build-arg LAUNCHER_BINARY=$(APP_NAME)-single-mac-x64 \
		--build-arg LAUNCHER_LDFLAGS="-s -w" \
		--output type=local,dest=$(MAC_DIST_DIR) .
	@echo ""
	@echo "Gotowe: $(MAC_OUTPUT)"

# Opcjonalny build macOS arm64. Jesli uzywana wersja Neutralino nie zawiera
# runtime `mac_arm64`, ten target zakonczy sie bledem na etapie wyboru runtime.
prepare-mac-arm64-dist:
	$(call ensure_output_dir,$(MAC_ARM64_DIST_DIR))

build-mac-arm64: prepare-mac-arm64-dist
	docker build \
		--build-arg TARGET_OS=darwin \
		--build-arg TARGET_ARCH=arm64 \
		--build-arg NEUTRALINO_PLATFORM=mac_arm64 \
		--build-arg EXTENSION_BINARY=http-extension \
		--build-arg APP_BINARY=$(APP_NAME) \
		--build-arg LAUNCHER_BINARY=$(APP_NAME)-single-mac-arm64 \
		--build-arg LAUNCHER_LDFLAGS="-s -w" \
		--output type=local,dest=$(MAC_ARM64_DIST_DIR) .
	@echo ""
	@echo "Gotowe: $(MAC_ARM64_OUTPUT)"

# Build wszystkich stabilnych targetow. macOS arm64 jest osobno, bo zalezy
# od tego, czy dana wersja Neutralino udostepnia runtime `mac_arm64`.
build-all: build-windows build-linux build-mac

# Pomocniczy target do sprawdzenia, gdzie trafia artefakty.
print-version:
	@echo "VERSION=$(VERSION)"
	@echo "VERSION_TAG=$(VERSION_TAG)"
	@echo "DIST_ROOT=$(DIST_ROOT)"
	@echo "WINDOWS_OUTPUT=$(WINDOWS_OUTPUT)"
	@echo "LINUX_OUTPUT=$(LINUX_OUTPUT)"
	@echo "MAC_OUTPUT=$(MAC_OUTPUT)"
	@echo "MAC_ARM64_OUTPUT=$(MAC_ARM64_OUTPUT)"

# Sprzatanie artefaktow dla aktualnej wersji.
# Nie usuwa starszych dist-docker-v*, zeby nie skasowac buildow porownawczych.
clean:
	rm -rf $(DIST_ROOT)
