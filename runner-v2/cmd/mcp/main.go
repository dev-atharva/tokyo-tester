package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/dev-atharva/cots/pkg/mcpserver"
)

func main() {
	appURL := env("TOKYO_TESTER_APP_URL", "http://ui:3000")
	server, err := mcpserver.New(appURL, os.Getenv("MCP_ALLOWED_ORIGIN"))
	if err != nil {
		log.Fatal(err)
	}
	address := ":" + env("PORT", "8090")
	httpServer := &http.Server{Addr: address, Handler: server.Handler(), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 35 * time.Second, WriteTimeout: 35 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("Tokyo Tester MCP listening on %s", address)
	log.Fatal(httpServer.ListenAndServe())
}

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
