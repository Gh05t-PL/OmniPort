# syntax=docker/dockerfile:1

FROM golang:1.22-bookworm AS extension-build
ARG TARGET_OS=windows
ARG TARGET_ARCH=amd64
ARG EXTENSION_BINARY=http-extension.exe
WORKDIR /src
COPY extensions/http/go.mod extensions/http/go.sum ./
RUN go mod download
COPY extensions/http/ ./
RUN CGO_ENABLED=0 GOOS=${TARGET_OS} GOARCH=${TARGET_ARCH} go build -trimpath -ldflags="-s -w" -o /out/extensions/${EXTENSION_BINARY} .

FROM node:20-bookworm AS neutralino-build
ARG EXTENSION_BINARY=http-extension.exe
ARG NEUTRALINO_PLATFORM=win_x64
ARG APP_BINARY=omniport.exe
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
COPY --from=extension-build /out/extensions/${EXTENSION_BINARY} ./extensions/${EXTENSION_BINARY}
RUN node scripts/sync-app-version.mjs
RUN node -e 'const fs=require("fs"); const ext=process.env.EXTENSION_BINARY; const config=JSON.parse(fs.readFileSync("neutralino.config.json","utf8")); config.extensions=config.extensions.map(item => item.id === "pl.codesymfony.omniport-http-ext" ? {...item, command: "${NL_PATH}/extensions/" + ext} : item); fs.writeFileSync("neutralino.config.json", JSON.stringify(config, null, 2) + "\n");'
RUN npm run build:web
RUN npx neu update
RUN npx neu build --release \
    && rm -f dist/omniport-release.zip \
    && find dist/omniport -maxdepth 1 -type f ! -name "omniport-${NEUTRALINO_PLATFORM}*" ! -name "resources.neu" -delete \
    && runtime_binary="$(find dist/omniport -maxdepth 1 -type f -name "omniport-${NEUTRALINO_PLATFORM}*" | head -n 1)" \
    && test -n "$runtime_binary" \
    && mv "$runtime_binary" "dist/omniport/${APP_BINARY}" \
    && chmod +x "dist/omniport/${APP_BINARY}"

FROM golang:1.22-bookworm AS launcher-build
ARG TARGET_OS=windows
ARG TARGET_ARCH=amd64
ARG LAUNCHER_BINARY=omniport-single.exe
ARG LAUNCHER_LDFLAGS="-H windowsgui -s -w"
WORKDIR /src
RUN if [ "$TARGET_OS" = "windows" ]; then \
        apt-get update \
        && apt-get install -y --no-install-recommends imagemagick binutils-mingw-w64 gcc-mingw-w64-x86-64 \
        && rm -rf /var/lib/apt/lists/*; \
    fi
COPY cmd/launcher/go.mod cmd/launcher/main.go ./
COPY package.json ./
RUN app_version="$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' package.json | head -n 1)" \
    && test -n "$app_version" \
    && sed -i 's/appVersion[[:space:]]*=[[:space:]]*"[^"]*"/appVersion           = "'"$app_version"'"/' main.go
COPY public/omniport-logo.png ./omniport-logo.png
# Windows pokazuje ikone finalnego launchera, wiec PNG logo osadzamy
# jako natywny zasob .ico przed kompilacja jednoplikowego .exe.
RUN if [ "$TARGET_OS" = "windows" ] && [ "$TARGET_ARCH" = "amd64" ]; then \
        convert omniport-logo.png -define icon:auto-resize=256,128,64,48,32,16 omniport.ico \
        && printf '1 ICON "omniport.ico"\n' > omniport.rc \
        && x86_64-w64-mingw32-windres omniport.rc -O coff -o omniport_windows_amd64.syso; \
    fi
COPY --from=neutralino-build /app/dist ./payload
RUN CGO_ENABLED=0 GOOS=${TARGET_OS} GOARCH=${TARGET_ARCH} go build -trimpath -ldflags="${LAUNCHER_LDFLAGS}" -o /out/${LAUNCHER_BINARY} .

FROM scratch AS export
ARG LAUNCHER_BINARY=omniport-single.exe
COPY --from=launcher-build /out/${LAUNCHER_BINARY} /${LAUNCHER_BINARY}
