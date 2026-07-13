package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/M1hawk005/UtRa/database"
	"github.com/M1hawk005/UtRa/internal/config"
	utraserver "github.com/M1hawk005/UtRa/internal/server"
)

func main() {
	cfg := config.FromEnv()
	db, err := database.NewLocalJSONDatabase(cfg.DataPath)
	if err != nil {
		log.Fatalf("load stellar dataset: %v", err)
	}
	handler, err := utraserver.NewServer(&cfg, db)
	if err != nil {
		log.Fatalf("construct server: %v", err)
	}

	httpServer := newHTTPServer(cfg.ListenAddr, handler)
	listener, err := net.Listen("tcp", cfg.ListenAddr)
	if err != nil {
		log.Fatalf("listen on %s: %v", cfg.ListenAddr, err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	log.Printf("UtRa server listening on %s", listener.Addr())
	if err := serve(ctx, httpServer, listener); err != nil {
		log.Fatalf("serve: %v", err)
	}
}

func newHTTPServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
}

func serve(ctx context.Context, srv *http.Server, listener net.Listener) error {
	serveErr := make(chan error, 1)
	go func() {
		serveErr <- srv.Serve(listener)
	}()

	select {
	case err := <-serveErr:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			return err
		}
		err := <-serveErr
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}
