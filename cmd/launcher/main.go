package main

import (
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	appName              = "omniport"
	appVersion           = "APP_VERSION$$"
	payloadRoot          = "payload"
	cleanupRetryInterval = 500 * time.Millisecond
	cleanupRetryWindow   = 15 * time.Second
	defaultMinWidth      = "960"
	defaultMinHeight     = "620"
	logEnv               = "OMNIPORT_LOG"
	logDirEnv            = "OMNIPORT_LOG_DIR"
	logMaxBytesEnv       = "OMNIPORT_LOG_MAX_BYTES"
	defaultLogMaxBytes   = 2 * 1024 * 1024
)

//go:embed payload/**
var payload embed.FS

var launcherLogger = newFileLogger("launcher")

type launcherOptions struct {
	neutralinoArgs []string
	loggingEnabled bool
	logDir         string
	logMaxBytes    int64
}

type fileLogger struct {
	component string
	enabled   bool
	dir       string
	maxBytes  int64
	mu        sync.Mutex
}

func main() {
	if err := runLauncher(); err != nil {
		_, _ = os.Stderr.WriteString(err.Error() + "\n")
		os.Exit(1)
	}
}

func runLauncher() error {
	options := parseLauncherOptions(os.Args[1:])
	launcherLogger.configure(options.loggingEnabled, options.logDir, options.logMaxBytes)

	baseDir, err := makeExtractionDir()
	if err != nil {
		logLauncher("temporary directory creation failed: " + err.Error())
		return err
	}
	defer removeExtractedPayload(baseDir)

	logLauncher("starting " + appName + " " + appVersion)
	logLauncher("logging enabled at " + launcherLogger.path())
	logLauncher("extracting payload to " + baseDir)

	if err := extractPayload(baseDir); err != nil {
		logLauncher("payload extraction failed: " + err.Error())
		return err
	}

	logLauncher("searching embedded executable " + appExecutableName())
	appExe, err := findAppExe(baseDir)
	if err != nil {
		logLauncher("embedded executable lookup failed: " + err.Error())
		return err
	}

	args := appendDefaultNeutralinoArgs(options.neutralinoArgs)

	logLauncher("starting embedded executable " + appExe + " with " + strconv.Itoa(len(args)) + " Neutralino args")
	command := exec.Command(appExe, args...)
	command.Dir = filepath.Dir(appExe)
	command.Env = childEnvironment(options)
	command.Stdin = os.Stdin
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr

	if err := command.Start(); err != nil {
		logLauncher("embedded executable start failed: " + err.Error())
		return err
	}
	stopSignalWatcher := watchForShutdownSignal(command)
	defer stopSignalWatcher()

	if err := command.Wait(); err != nil {
		logLauncher("embedded executable exited with error: " + err.Error())
		return err
	}
	logLauncher("embedded executable exited cleanly")
	return nil
}

func parseLauncherOptions(args []string) launcherOptions {
	options := launcherOptions{
		neutralinoArgs: make([]string, 0, len(args)),
		loggingEnabled: isTruthy(os.Getenv(logEnv)),
		logDir:         os.Getenv(logDirEnv),
		logMaxBytes:    parseLogMaxBytes(os.Getenv(logMaxBytesEnv)),
	}

	for _, arg := range args {
		switch {
		case arg == "--omniport-log":
			options.loggingEnabled = true
		case strings.HasPrefix(arg, "--omniport-log="):
			options.loggingEnabled = parseBoolFlag(strings.TrimPrefix(arg, "--omniport-log="), options.loggingEnabled)
		case strings.HasPrefix(arg, "--omniport-log-dir="):
			options.logDir = strings.TrimSpace(strings.TrimPrefix(arg, "--omniport-log-dir="))
			if options.logDir != "" {
				options.loggingEnabled = true
			}
		case strings.HasPrefix(arg, "--omniport-log-max-bytes="):
			options.logMaxBytes = parseLogMaxBytes(strings.TrimPrefix(arg, "--omniport-log-max-bytes="))
			options.loggingEnabled = true
		default:
			options.neutralinoArgs = append(options.neutralinoArgs, arg)
		}
	}

	if options.logMaxBytes <= 0 {
		options.logMaxBytes = defaultLogMaxBytes
	}
	return options
}

func childEnvironment(options launcherOptions) []string {
	env := os.Environ()
	if options.loggingEnabled {
		env = setEnv(env, logEnv, "1")
		env = setEnv(env, logDirEnv, launcherLogger.dir)
		env = setEnv(env, logMaxBytesEnv, strconv.FormatInt(options.logMaxBytes, 10))
		return env
	}
	return setEnv(env, logEnv, "0")
}

func setEnv(env []string, key string, value string) []string {
	prefix := key + "="
	for index, item := range env {
		if strings.HasPrefix(item, prefix) {
			env[index] = prefix + value
			return env
		}
	}
	return append(env, prefix+value)
}

func appendDefaultNeutralinoArgs(args []string) []string {
	args = appendDefaultArg(args, "--window-min-width", defaultMinWidth)
	args = appendDefaultArg(args, "--window-min-height", defaultMinHeight)
	args = appendDefaultArg(args, "--window-use-saved-state", "true")
	args = appendDefaultArg(args, "--window-always-on-top", "true")
	return args
}

func appendDefaultArg(args []string, flag string, value string) []string {
	if hasArg(args, flag) {
		return args
	}
	return append(args, flag+"="+value)
}

func hasArg(args []string, flag string) bool {
	for _, arg := range args {
		if arg == flag || strings.HasPrefix(arg, flag+"=") {
			return true
		}
	}
	return false
}

func watchForShutdownSignal(command *exec.Cmd) func() {
	signals := make(chan os.Signal, 1)
	done := make(chan struct{})
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)

	go func() {
		select {
		case signalValue := <-signals:
			logLauncher("launcher received shutdown signal: " + signalValue.String())
			if command.Process != nil {
				_ = command.Process.Kill()
			}
		case <-done:
		}
	}()

	return func() {
		signal.Stop(signals)
		close(done)
	}
}

func makeExtractionDir() (string, error) {
	rootDir := filepath.Join(os.TempDir(), appName)
	if err := os.MkdirAll(rootDir, 0o755); err != nil {
		return "", err
	}
	return os.MkdirTemp(rootDir, appVersion+"-")
}

func removeExtractedPayload(baseDir string) {
	deadline := time.Now().Add(cleanupRetryWindow)
	for {
		if err := os.RemoveAll(baseDir); err == nil {
			return
		} else if time.Now().After(deadline) {
			logLauncher("temporary directory cleanup failed: " + err.Error())
			return
		}
		time.Sleep(cleanupRetryInterval)
	}
}

func extractPayload(baseDir string) error {
	return fs.WalkDir(payload, payloadRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		relative, err := filepath.Rel(payloadRoot, filepath.FromSlash(path))
		if err != nil || relative == "." {
			return err
		}

		target := filepath.Join(baseDir, relative)
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}

		data, err := payload.ReadFile(path)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		return os.WriteFile(target, data, 0o755)
	})
}

func findAppExe(baseDir string) (string, error) {
	var match string
	expectedName := appExecutableName()
	err := filepath.WalkDir(baseDir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		if strings.EqualFold(filepath.Base(path), expectedName) {
			match = path
			return fs.SkipAll
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if match == "" {
		return "", errors.New("embedded Neutralino executable was not found: " + expectedName)
	}
	return match, nil
}

func appExecutableName() string {
	if runtime.GOOS == "windows" {
		return appName + ".exe"
	}
	return appName
}

func newFileLogger(component string) *fileLogger {
	return &fileLogger{
		component: component,
		maxBytes:  defaultLogMaxBytes,
	}
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

func (logger *fileLogger) path() string {
	logger.mu.Lock()
	defer logger.mu.Unlock()
	return logger.pathLocked()
}

func (logger *fileLogger) pathLocked() string {
	dir := logger.dir
	if dir == "" {
		dir = defaultLogDir()
	}
	return filepath.Join(dir, appName+"-"+logger.component+".log")
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
			return filepath.Join(stateHome, "omniport", "logs")
		}
	}

	if home, err := os.UserHomeDir(); err == nil {
		return filepath.Join(home, ".local", "state", "omniport", "logs")
	}
	return filepath.Join(os.TempDir(), appName, "logs")
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

func parseBoolFlag(value string, fallback bool) bool {
	value = strings.ToLower(strings.TrimSpace(value))
	if isTruthy(value) {
		return true
	}
	if value == "0" || value == "false" || value == "no" || value == "off" {
		return false
	}
	return fallback
}

func isTruthy(value string) bool {
	value = strings.ToLower(strings.TrimSpace(value))
	return value == "1" || value == "true" || value == "yes" || value == "on" || value == "debug"
}

func logLauncher(message string) {
	launcherLogger.printf("%s", message)
}
