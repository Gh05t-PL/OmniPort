package main

import (
	"crypto/rand"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

func newFileLogger(component string) *fileLogger {
	logger := &fileLogger{component: component}
	logger.configure(isTruthy(os.Getenv(logEnv)), os.Getenv(logDirEnv), parseLogMaxBytes(os.Getenv(logMaxBytesEnv)))
	return logger
}

func (logger *fileLogger) configure(enabled bool, dir string, maxBytes int64) {
	logger.mu.Lock()
	defer logger.mu.Unlock()

	logger.enabled = enabled
	logger.dir = strings.TrimSpace(dir)
	if logger.dir == "" {
		logger.dir = defaultLogDir()
	}
	if maxBytes <= 0 {
		maxBytes = defaultLogMaxBytes
	}
	logger.maxBytes = maxBytes
}

func (logger *fileLogger) isEnabled() bool {
	logger.mu.Lock()
	defer logger.mu.Unlock()
	return logger.enabled
}

func (logger *fileLogger) printf(format string, values ...any) {
	logger.mu.Lock()
	defer logger.mu.Unlock()

	if !logger.enabled {
		return
	}

	path := logger.pathLocked()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return
	}
	rotateLogFile(path, logger.maxBytes)

	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return
	}
	defer file.Close()

	message := fmt.Sprintf(format, values...)
	_, _ = file.WriteString(time.Now().Format(time.RFC3339Nano) + " " + message + "\n")
}

func (logger *fileLogger) pathLocked() string {
	dir := logger.dir
	if dir == "" {
		dir = defaultLogDir()
	}
	return filepath.Join(dir, logAppName+"-"+logger.component+".log")
}

func logExtension(format string, values ...any) {
	extensionLogger.printf(format, values...)
}

func defaultLogDir() string {
	switch runtime.GOOS {
	case "windows":
		if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
			return filepath.Join(localAppData, "OmniPort", "logs")
		}
	case "darwin":
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, "Library", "Logs", "OmniPort")
		}
	default:
		if stateHome := os.Getenv("XDG_STATE_HOME"); stateHome != "" {
			return filepath.Join(stateHome, logAppName, "logs")
		}
	}

	if home, err := os.UserHomeDir(); err == nil {
		return filepath.Join(home, ".local", "state", logAppName, "logs")
	}
	return filepath.Join(os.TempDir(), logAppName, "logs")
}

func rotateLogFile(path string, maxBytes int64) {
	if maxBytes <= 0 {
		return
	}
	info, err := os.Stat(path)
	if err != nil || info.Size() < maxBytes {
		return
	}
	_ = os.Remove(path + ".1")
	_ = os.Rename(path, path+".1")
}

func parseLogMaxBytes(value string) int64 {
	parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil || parsed <= 0 {
		return defaultLogMaxBytes
	}
	return parsed
}

func isTruthy(value string) bool {
	value = strings.ToLower(strings.TrimSpace(value))
	return value == "1" || value == "true" || value == "yes" || value == "on" || value == "debug"
}

func requestHost(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" {
		return "<invalid>"
	}
	return parsed.Scheme + "://" + parsed.Host
}

func singleLine(value string) string {
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, "\r", " ")
	value = strings.ReplaceAll(value, "\n", " ")
	value = strings.Join(strings.Fields(value), " ")
	return truncateLogValue(value, 300)
}

func truncateLogValue(value string, maxLength int) string {
	if maxLength <= 0 || len(value) <= maxLength {
		return value
	}
	return value[:maxLength] + "...<truncated>"
}

func randomID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return fmt.Sprintf("%x-%x-%x-%x-%x", bytes[0:4], bytes[4:6], bytes[6:8], bytes[8:10], bytes[10:16])
}
