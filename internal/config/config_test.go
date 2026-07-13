package config

import "testing"

func TestFromEnvUsesDefaultsAndOverrides(t *testing.T) {
	t.Setenv("UTRA_LISTEN_ADDR", "")
	t.Setenv("UTRA_DATA_PATH", "")

	got := FromEnv()
	if got.ListenAddr != ":8080" {
		t.Fatalf("default ListenAddr = %q, want %q", got.ListenAddr, ":8080")
	}
	if got.DataPath != "data/nosql_mock/stars" {
		t.Fatalf("default DataPath = %q, want %q", got.DataPath, "data/nosql_mock/stars")
	}

	t.Setenv("UTRA_LISTEN_ADDR", "127.0.0.1:9090")
	t.Setenv("UTRA_DATA_PATH", "/srv/utra/stars")
	got = FromEnv()
	if got.ListenAddr != "127.0.0.1:9090" || got.DataPath != "/srv/utra/stars" {
		t.Fatalf("overrides = %#v", got)
	}
}
