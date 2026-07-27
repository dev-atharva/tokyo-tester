package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/dev-atharva/cots/pkg/mcpserver"
)

func main() {
	server, err := mcpserver.New(mcpserver.Config{
		AppBaseURL:            env("TOKYO_TESTER_APP_URL", "http://ui:3000"),
		PublicMCPURL:          env("MCP_PUBLIC_URL", "http://localhost:8090/mcp"),
		AllowedOrigins:        os.Getenv("MCP_ALLOWED_ORIGIN"),
		AuthMode:              env("MCP_AUTH_MODE", "personal_token"),
		OAuthIssuer:           os.Getenv("MCP_OAUTH_ISSUER"),
		OAuthIntrospectionURL: os.Getenv("MCP_OAUTH_INTROSPECTION_URL"),
		OAuthClientID:         os.Getenv("MCP_OAUTH_CLIENT_ID"),
		OAuthClientSecret:     os.Getenv("MCP_OAUTH_CLIENT_SECRET"),
		InternalSecret:        os.Getenv("MCP_INTERNAL_SECRET"),
	})
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
