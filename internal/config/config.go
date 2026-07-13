package config

import "os"

const (
	defaultListenAddr = ":8080"
	defaultDataPath   = "data/nosql_mock/stars"
)

// Config contains process configuration for the UtRa HTTP service.
type Config struct {
	ListenAddr string
	DataPath   string
}

// FromEnv loads configuration from the environment, applying self-hosting defaults.
func FromEnv() Config {
	return Config{
		ListenAddr: envOrDefault("UTRA_LISTEN_ADDR", defaultListenAddr),
		DataPath:   envOrDefault("UTRA_DATA_PATH", defaultDataPath),
	}
}

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
