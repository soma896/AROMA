package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/soma896/AROMA/backend/clock"
	"github.com/soma896/AROMA/backend/config"
	"github.com/soma896/AROMA/backend/presence"
	"github.com/soma896/AROMA/backend/protocol"
	"github.com/soma896/AROMA/backend/user"
)

func setupTestServer() *httptest.Server {
	// Each test server starts with its own party-creation allowance.
	createLimiter = newIPRateLimiter(time.Minute, config.CreateRatePerMinute, config.RateLimitMaxEntries)
	mux := http.NewServeMux()
	registerRoutes(mux)
	return httptest.NewServer(corsMiddleware(mux))
}

func TestRESTEndpoints(t *testing.T) {
	ts := setupTestServer()
	defer ts.Close()

	// 1. Health check
	res, err := http.Get(ts.URL + "/healthz")
	if err != nil {
		t.Fatalf("GET /healthz failed with err: %v", err)
	}
	if res.StatusCode != http.StatusOK {
		t.Fatalf("GET /healthz failed: status %v", res.StatusCode)
	}
	var health map[string]interface{}
	_ = json.NewDecoder(res.Body).Decode(&health)
	if health["ok"] != true {
		t.Fatalf("Expected ok: true in healthz")
	}

	// 1b. Non-existent subpaths must return 404, not root 200
	resBogusHealth, err := http.Get(ts.URL + "/1324/healthz")
	if err != nil || resBogusHealth.StatusCode != http.StatusNotFound {
		t.Fatalf("Expected 404 for /1324/healthz, got %v, err %v", resBogusHealth.StatusCode, err)
	}
	resBogusPath, err := http.Get(ts.URL + "/1324")
	if err != nil || resBogusPath.StatusCode != http.StatusNotFound {
		t.Fatalf("Expected 404 for /1324, got %v, err %v", resBogusPath.StatusCode, err)
	}

	// 2. Server time
	resTime, err := http.Get(ts.URL + "/api/time")
	if err != nil || resTime.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/time failed: status %v, err %v", resTime.StatusCode, err)
	}
	var timeResp map[string]interface{}
	_ = json.NewDecoder(resTime.Body).Decode(&timeResp)
	if _, ok := timeResp["serverMs"].(float64); !ok {
		t.Fatalf("Expected numeric serverMs")
	}

	// 3. Create Party
	createBody := map[string]string{
		"userId":      "u_alice",
		"deviceId":    "d_alice",
		"displayName": "Alice",
	}
	b, _ := json.Marshal(createBody)
	createRes, err := http.Post(ts.URL+"/api/parties", "application/json", bytes.NewReader(b))
	if err != nil || createRes.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/parties failed: status %v, err %v", createRes.StatusCode, err)
	}
	var partyResp map[string]interface{}
	_ = json.NewDecoder(createRes.Body).Decode(&partyResp)

	code, _ := partyResp["code"].(string)
	token, _ := partyResp["token"].(string)
	if code == "" || token == "" {
		t.Fatalf("Expected code and token in response")
	}

	// 4. Join Party
	joinBody := map[string]string{
		"userId":      "u_bob",
		"deviceId":    "d_bob",
		"displayName": "Bob",
	}
	jb, _ := json.Marshal(joinBody)
	joinRes, err := http.Post(fmt.Sprintf("%s/api/parties/%s/join", ts.URL, code), "application/json", bytes.NewReader(jb))
	if err != nil || joinRes.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/parties/%s/join failed: status %v", code, joinRes.StatusCode)
	}

	// 5. Get Party with token
	req, _ := http.NewRequest("GET", fmt.Sprintf("%s/api/parties/%s", ts.URL, code), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	getRes, err := http.DefaultClient.Do(req)
	if err != nil || getRes.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/parties/%s failed with token: status %v", code, getRes.StatusCode)
	}

	// 6. Get Party without token should be 401
	unauthReq, _ := http.NewRequest("GET", fmt.Sprintf("%s/api/parties/%s", ts.URL, code), nil)
	unauthRes, err := http.DefaultClient.Do(unauthReq)
	if err != nil || unauthRes.StatusCode != http.StatusUnauthorized {
		t.Fatalf("Expected 401 Unauthorized, got %v", unauthRes.StatusCode)
	}
}

func TestWebSocketFlow(t *testing.T) {
	ts := setupTestServer()
	defer ts.Close()

	// Create Party
	createBody := map[string]string{
		"userId":      "u1",
		"deviceId":    "d1",
		"displayName": "Host",
	}
	b, _ := json.Marshal(createBody)
	res, _ := http.Post(ts.URL+"/api/parties", "application/json", bytes.NewReader(b))
	var pResp map[string]interface{}
	_ = json.NewDecoder(res.Body).Decode(&pResp)
	code := pResp["code"].(string)
	token := pResp["token"].(string)

	// Connect WebSocket
	u, _ := url.Parse(ts.URL)
	u.Scheme = "ws"
	u.Path = fmt.Sprintf("/ws/parties/%s", code)
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+token)
	ws, _, err := websocket.DefaultDialer.Dial(u.String(), headers)
	if err != nil {
		t.Fatalf("WebSocket connection failed: %v", err)
	}
	defer ws.Close()

	// 1. Should receive welcome frame
	var welcome map[string]interface{}
	_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	if err := ws.ReadJSON(&welcome); err != nil {
		t.Fatalf("Failed to read welcome frame: %v", err)
	}
	if welcome["type"] != protocol.FrameWelcome {
		t.Fatalf("Expected welcome frame, got: %v", welcome["type"])
	}

	// 2. May receive members frame from broadcast
	_ = ws.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	var nextFrame map[string]interface{}
	if err := ws.ReadJSON(&nextFrame); err == nil {
		if nextFrame["type"] != protocol.FrameMembers && nextFrame["type"] != protocol.FrameState {
			t.Logf("Received broadcast frame: %v", nextFrame["type"])
		}
	}

	// 3. Send Ping, expect Pong
	ping := map[string]interface{}{
		"type":     protocol.FramePing,
		"clientMs": 123456789,
	}
	if err := ws.WriteJSON(ping); err != nil {
		t.Fatalf("Failed to write ping: %v", err)
	}

	var pong map[string]interface{}
	for {
		_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
		if err := ws.ReadJSON(&pong); err != nil {
			t.Fatalf("Failed to read pong: %v", err)
		}
		if pong["type"] == protocol.FramePong {
			break
		}
	}
	if pong["clientMs"] != float64(123456789) {
		t.Errorf("Expected pong clientMs to match, got %v", pong["clientMs"])
	}

	// 4. Send queueAdd control
	addControl := map[string]interface{}{
		"type":   protocol.FrameControl,
		"action": protocol.ActionQueueAdd,
		"track": map[string]interface{}{
			"videoId": "abc_song",
			"title":   "Test Song",
			"artist":  "Artist",
		},
	}
	if err := ws.WriteJSON(addControl); err != nil {
		t.Fatalf("Failed to send queueAdd: %v", err)
	}

	// Read until queue frame or state frame received
	var receivedQueue bool
	for i := 0; i < 5; i++ {
		_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
		var f map[string]interface{}
		if err := ws.ReadJSON(&f); err != nil {
			break
		}
		if f["type"] == protocol.FrameQueue {
			receivedQueue = true
			qData, _ := f["queue"].(map[string]interface{})
			items, _ := qData["items"].([]interface{})
			if len(items) != 1 {
				t.Errorf("Expected 1 item in queue, got %d", len(items))
			}
			break
		}
	}
	if !receivedQueue {
		t.Fatalf("Expected queue broadcast after queueAdd")
	}
}

func TestCreateRateLimiter(t *testing.T) {
	limiter := newIPRateLimiter(time.Minute, 2, 100)
	if !limiter.Allow("203.0.113.10") || !limiter.Allow("203.0.113.10") {
		t.Fatal("expected the first two creations from an IP to be allowed")
	}
	if limiter.Allow("203.0.113.10") {
		t.Fatal("expected the third creation from an IP to be rate limited")
	}
	if !limiter.Allow("203.0.113.11") {
		t.Fatal("expected a separate IP to have its own allowance")
	}
}

func TestRateLimiterFreesExpiredEntriesWhenFull(t *testing.T) {
	limiter := newIPRateLimiter(time.Minute, 5, 1)
	if !limiter.Allow("203.0.113.20") {
		t.Fatal("expected the first IP to fit")
	}
	if limiter.Allow("203.0.113.21") {
		t.Fatal("expected a second IP to be refused while the table is full")
	}
	// Age the only entry past the window; a full table must sweep it to make room.
	entry := limiter.entries["203.0.113.20"]
	entry.started = entry.started.Add(-2 * time.Minute)
	limiter.entries["203.0.113.20"] = entry
	if !limiter.Allow("203.0.113.21") {
		t.Fatal("expected the expired entry to be swept for the new IP")
	}
}

func postPresence(t *testing.T, ts *httptest.Server, body string, origin string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/presence", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /api/presence failed: %v", err)
	}
	return res
}

func liveStats(t *testing.T, ts *httptest.Server) presence.Counts {
	t.Helper()
	res, err := http.Get(ts.URL + "/api/stats/live")
	if err != nil || res.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/stats/live failed: status %v, err %v", res.StatusCode, err)
	}
	if got := res.Header.Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("stats must be readable from any site, got Access-Control-Allow-Origin %q", got)
	}
	var counts presence.Counts
	if err := json.NewDecoder(res.Body).Decode(&counts); err != nil {
		t.Fatalf("decode stats: %v", err)
	}
	return counts
}

func TestPresence(t *testing.T) {
	presenceTracker = presence.NewTracker(6*time.Minute, 1000)
	presenceLimiter = newIPRateLimiter(time.Minute, 100, 100)
	ts := setupTestServer()
	defer ts.Close()

	const phone = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b"
	const pc = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f"

	res := postPresence(t, ts, `{"id":"`+phone+`","platform":"android","open":true}`, "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("android ping: status %d", res.StatusCode)
	}
	var reply map[string]int
	_ = json.NewDecoder(res.Body).Decode(&reply)
	if reply["intervalSec"] != config.PresenceIntervalSec {
		t.Fatalf("expected intervalSec %d, got %v", config.PresenceIntervalSec, reply)
	}
	postPresence(t, ts, `{"id":"`+pc+`","platform":"pc","open":true}`, "")
	// The same install pinging again is still one install.
	postPresence(t, ts, `{"id":"`+phone+`","platform":"android","open":true}`, "")

	presenceTracker.Sweep(clock.NowMs())
	if got := liveStats(t, ts); got.Online != 2 || got.Android != 1 || got.PC != 1 {
		t.Fatalf("got %+v, want 2 online (1 android, 1 pc)", got)
	}

	postPresence(t, ts, `{"id":"`+pc+`","platform":"pc","open":false}`, "")
	presenceTracker.Sweep(clock.NowMs())
	if got := liveStats(t, ts); got.Online != 1 || got.PC != 0 {
		t.Fatalf("got %+v, want the closed pc gone", got)
	}

	// The web player counts as its own platform, from its allowed origin only.
	const web = "5a6b7c8d-1e2f-4a3b-9c4d-0e1f2a3b4c5d"
	const webOrigin = "https://web.example.test"
	prev := config.AllowedOrigins
	config.AllowedOrigins = []string{webOrigin}
	defer func() { config.AllowedOrigins = prev }()
	webPing := `{"id":"` + web + `","platform":"browser","open":true}`
	if res := postPresence(t, ts, webPing, webOrigin); res.StatusCode != http.StatusOK {
		t.Fatalf("browser ping: status %d", res.StatusCode)
	}
	presenceTracker.Sweep(clock.NowMs())
	if got := liveStats(t, ts); got.Online != 2 || got.Android != 1 || got.Browser != 1 {
		t.Fatalf("got %+v, want 2 online (1 android, 1 browser)", got)
	}
	for name, origin := range map[string]string{"no origin": "", "other origin": "https://example.com"} {
		if res := postPresence(t, ts, webPing, origin); res.StatusCode != http.StatusForbidden {
			t.Errorf("browser ping with %s: status %d, want 403", name, res.StatusCode)
		}
	}
	if res := postPresence(t, ts, `{"id":"`+pc+`","platform":"pc","open":true}`, webOrigin); res.StatusCode != http.StatusForbidden {
		t.Errorf("native platform from the web origin: status %d, want 403", res.StatusCode)
	}
	postPresence(t, ts, `{"id":"`+web+`","platform":"browser","open":false}`, webOrigin)
	presenceTracker.Sweep(clock.NowMs())
	if got := liveStats(t, ts); got.Online != 1 || got.Browser != 0 {
		t.Fatalf("got %+v, want the closed browser gone", got)
	}

	rejected := []struct {
		name   string
		body   string
		origin string
		status int
	}{
		{"unknown platform", `{"id":"` + pc + `","platform":"ios","open":true}`, "", http.StatusUnprocessableEntity},
		{"desktop is not a platform name", `{"id":"` + pc + `","platform":"desktop","open":true}`, "", http.StatusUnprocessableEntity},
		{"bad id", `{"id":"abc","platform":"pc","open":true}`, "", http.StatusUnprocessableEntity},
		{"missing open", `{"id":"` + pc + `","platform":"pc"}`, "", http.StatusUnprocessableEntity},
		{"from a browser", `{"id":"` + pc + `","platform":"pc","open":true}`, "https://example.com", http.StatusForbidden},
	}
	for _, c := range rejected {
		if res := postPresence(t, ts, c.body, c.origin); res.StatusCode != c.status {
			t.Errorf("%s: status %d, want %d", c.name, res.StatusCode, c.status)
		}
	}
	presenceTracker.Sweep(clock.NowMs())
	if got := liveStats(t, ts); got.Online != 1 {
		t.Fatalf("rejected pings changed the count: %+v", got)
	}
}

func TestPresenceRateLimit(t *testing.T) {
	presenceTracker = presence.NewTracker(6*time.Minute, 1000)
	presenceLimiter = newIPRateLimiter(time.Minute, 2, 100)
	ts := setupTestServer()
	defer ts.Close()

	body := `{"id":"3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b","platform":"android","open":true}`
	postPresence(t, ts, body, "")
	postPresence(t, ts, body, "")
	if res := postPresence(t, ts, body, ""); res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("third ping in a minute: status %d, want 429", res.StatusCode)
	}
}

func TestLiveBadge(t *testing.T) {
	presenceTracker = presence.NewTracker(6*time.Minute, 1000)
	presenceLimiter = newIPRateLimiter(time.Minute, 100, 100)
	ts := setupTestServer()
	defer ts.Close()

	postPresence(t, ts, `{"id":"3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b","platform":"android","open":true}`, "")
	presenceTracker.Sweep(clock.NowMs())

	res, err := http.Get(ts.URL + "/api/stats/live/badge.svg")
	if err != nil || res.StatusCode != http.StatusOK {
		t.Fatalf("GET badge failed: status %v, err %v", res.StatusCode, err)
	}
	// GitHub's camo proxy only refetches when the origin says not to cache.
	if got := res.Header.Get("Cache-Control"); !strings.Contains(got, "no-cache") {
		t.Fatalf("badge must not be cached, got Cache-Control %q", got)
	}
	var body bytes.Buffer
	_, _ = body.ReadFrom(res.Body)
	// shields.io's own render of "LISTENING NOW: 1", so the badge looks unchanged.
	want := `<svg xmlns="http://www.w3.org/2000/svg" width="156.5" height="28" role="img" aria-label="LISTENING NOW: 1"><title>LISTENING NOW: 1</title><g shape-rendering="crispEdges"><rect width="124.25" height="28" fill="#0d1117"/><rect x="124.25" width="32.25" height="28" fill="#fb4f67"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="100"><text transform="scale(.1)" x="621.25" y="175" textLength="1002.5">LISTENING NOW</text><text transform="scale(.1)" x="1403.75" y="175" textLength="82.5" font-weight="bold">1</text></g></svg>`
	if body.String() != want {
		t.Fatalf("badge svg differs from shields:\n got %s\nwant %s", body.String(), want)
	}
}

func TestRequestOrigin(t *testing.T) {
	r := httptest.NewRequest("GET", "http://example.com/invite/ABC123", nil)
	r.Header.Set("X-Forwarded-Proto", "https")

	// Without JAM_TRUST_PROXY the forwarded proto is ignored.
	if got := requestOrigin(r); got != "http://example.com" {
		t.Errorf("Expected http://example.com, got %s", got)
	}

	config.TrustProxy = true
	t.Cleanup(func() { config.TrustProxy = false })
	if got := requestOrigin(r); got != "https://example.com" {
		t.Errorf("Expected https://example.com, got %s", got)
	}

	// An explicit public origin wins over request headers.
	config.PublicOrigin = "https://party.example.com"
	t.Cleanup(func() { config.PublicOrigin = "" })
	if got := requestOrigin(r); got != "https://party.example.com" {
		t.Errorf("Expected https://party.example.com, got %s", got)
	}

	// When unset it falls back to inference.
	config.PublicOrigin = ""
	if got := requestOrigin(r); got != "https://example.com" {
		t.Errorf("Expected fallback to https://example.com, got %s", got)
	}
}

func TestInviteDeepLinkUsesPublicOrigin(t *testing.T) {
	ts := setupTestServer()
	defer ts.Close()

	p, err := store.Create()
	if err != nil {
		t.Fatalf("Party creation failed: %v", err)
	}

	config.PublicOrigin = "https://party.example.com"
	t.Cleanup(func() { config.PublicOrigin = "" })

	res, err := http.Get(ts.URL + "/invite/" + p.Code)
	if err != nil {
		t.Fatalf("GET /invite/%s failed: %v", p.Code, err)
	}
	buf := new(bytes.Buffer)
	_, _ = buf.ReadFrom(res.Body)
	content := buf.String()

	if !strings.Contains(content, "server=https%3A%2F%2Fparty.example.com") {
		t.Errorf("Expected deep link to carry the public origin, got: %s", content)
	}
	if strings.Contains(content, "server=http%3A") {
		t.Errorf("Expected no http server URL in deep link, got: %s", content)
	}
}

func TestInviteLanding(t *testing.T) {
	ts := setupTestServer()
	defer ts.Close()

	// 1. Non-existent party
	res, err := http.Get(ts.URL + "/invite/ZZZZZZ")
	if err != nil {
		t.Fatalf("GET /invite/ZZZZZZ failed: %v", err)
	}
	if res.StatusCode != http.StatusNotFound {
		t.Errorf("Expected 404 for non-existent party, got %d", res.StatusCode)
	}

	// 2. Create an active party directly in store
	p, err := store.Create()
	if err != nil {
		t.Fatalf("Party creation failed: %v", err)
	}
	code := p.Code

	// 3. Active party landing page
	resActive, err := http.Get(ts.URL + "/invite/" + code)
	if err != nil {
		t.Fatalf("GET /invite/%s failed: %v", code, err)
	}
	if resActive.StatusCode != http.StatusOK {
		t.Errorf("Expected 200 for active party invite, got %d", resActive.StatusCode)
	}
	buf := new(bytes.Buffer)
	_, _ = buf.ReadFrom(resActive.Body)
	content := buf.String()

	expectedDeepLinkPrefix := "aroma://party/" + code
	if !strings.Contains(content, expectedDeepLinkPrefix) {
		t.Errorf("Expected HTML content to contain deep link %s", expectedDeepLinkPrefix)
	}
	if !strings.Contains(content, code) {
		t.Errorf("Expected HTML content to contain party code %s", code)
	}
}

// A browser offers the token as a subprotocol (it cannot set Authorization on
// a WebSocket). The server answers with the protocol name alone, never the token.
func TestWebSocketTokenAsSubprotocol(t *testing.T) {
	ts := setupTestServer()
	defer ts.Close()

	b, _ := json.Marshal(map[string]string{"userId": "u1", "deviceId": "d1", "displayName": "Host"})
	res, _ := http.Post(ts.URL+"/api/parties", "application/json", bytes.NewReader(b))
	var created map[string]interface{}
	_ = json.NewDecoder(res.Body).Decode(&created)
	code := created["code"].(string)
	token := created["token"].(string)

	u, _ := url.Parse(ts.URL)
	u.Scheme = "ws"
	u.Path = fmt.Sprintf("/ws/parties/%s", code)

	dialer := websocket.Dialer{Subprotocols: []string{socketProtocol, socketTokenPrefix + token}}
	ws, resp, err := dialer.Dial(u.String(), nil)
	if err != nil {
		t.Fatalf("WebSocket with a subprotocol token failed: %v", err)
	}
	defer ws.Close()
	if got := resp.Header.Get("Sec-WebSocket-Protocol"); got != socketProtocol {
		t.Fatalf("expected the server to answer %q, got %q", socketProtocol, got)
	}
	var welcome map[string]interface{}
	_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	if err := ws.ReadJSON(&welcome); err != nil || welcome["type"] != protocol.FrameWelcome {
		t.Fatalf("expected a welcome frame, got %v (%v)", welcome["type"], err)
	}

	bad := websocket.Dialer{Subprotocols: []string{socketProtocol, socketTokenPrefix + "nottherighttoken"}}
	if _, resp, err := bad.Dial(u.String(), nil); err == nil || resp == nil || resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for a wrong subprotocol token, got %v", err)
	}
}

func TestProxyCORSHeaders(t *testing.T) {
	ts := setupTestServer()
	defer ts.Close()

	// 1. Test OPTIONS preflight on proxy
	req, _ := http.NewRequest("OPTIONS", ts.URL+"/__yt_music__/youtubei/v1/browse", nil)
	req.Header.Set("Origin", "https://aroma-web-player.onrender.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "content-type")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("OPTIONS request failed: %v", err)
	}
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("Expected 204 for OPTIONS, got %d", resp.StatusCode)
	}
	origins := resp.Header.Values("Access-Control-Allow-Origin")
	if len(origins) != 1 || origins[0] != "*" {
		t.Fatalf("Expected exactly one Access-Control-Allow-Origin: *, got %v", origins)
	}
}

func TestBestPartEndpoints(t *testing.T) {
	ts := setupTestServer()
	defer ts.Close()

	// 1. Initial GET on non-existent song should return 404
	res404, err := http.Get(ts.URL + "/api/best-part/unknown_song")
	if err != nil || res404.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown song, got %v, err %v", res404.StatusCode, err)
	}

	// 2. POST save best part
	body := map[string]interface{}{
		"startSec":   42.5,
		"endSec":     72.5,
		"verified":   true,
		"method":     "ai",
		"confidence": 0.92,
		"title":      "Paddanandi",
		"artist":     "Udit Narayan, Chitra",
	}
	b, _ := json.Marshal(body)
	saveRes, err := http.Post(ts.URL+"/api/best-part/song_paddanandi", "application/json", bytes.NewReader(b))
	if err != nil || saveRes.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/best-part/song_paddanandi failed: status %v, err %v", saveRes.StatusCode, err)
	}

	var saved map[string]interface{}
	_ = json.NewDecoder(saveRes.Body).Decode(&saved)
	if saved["songId"] != "song_paddanandi" || saved["startSec"] != 42.5 || saved["verified"] != true {
		t.Fatalf("unexpected save response: %+v", saved)
	}

	// 3. GET saved song
	getRes, err := http.Get(ts.URL + "/api/best-part/song_paddanandi")
	if err != nil || getRes.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/best-part/song_paddanandi failed: status %v", getRes.StatusCode)
	}
	var fetched map[string]interface{}
	_ = json.NewDecoder(getRes.Body).Decode(&fetched)
	if fetched["startSec"] != 42.5 || fetched["endSec"] != 72.5 || fetched["verified"] != true {
		t.Fatalf("unexpected fetched response: %+v", fetched)
	}

	// 4. GET /api/best-parts
	listRes, err := http.Get(ts.URL + "/api/best-parts")
	if err != nil || listRes.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/best-parts failed: status %v", listRes.StatusCode)
	}
	var listResp map[string]interface{}
	_ = json.NewDecoder(listRes.Body).Decode(&listResp)
	if count, ok := listResp["count"].(float64); !ok || count < 1 {
		t.Fatalf("expected at least 1 item in list, got %v", listResp["count"])
	}
}

type mockTokenVerifier struct{}

func (m *mockTokenVerifier) VerifyToken(idToken string, expectedAudience string) (*user.GoogleTokenInfo, error) {
	if idToken == "bad_token" {
		return nil, errors.New("invalid google token: signature check failed")
	}
	if idToken == "unverified_email_token" {
		return nil, errors.New("email is not verified")
	}
	if idToken == "expired_token" {
		return nil, errors.New("token has expired")
	}
	if strings.HasPrefix(idToken, "valid_token_") {
		sub := strings.TrimPrefix(idToken, "valid_token_")
		return &user.GoogleTokenInfo{
			Sub:           "google_" + sub,
			Email:         sub + "@gmail.com",
			EmailVerified: "true",
			Name:          "User " + sub,
			Picture:       "https://lh3.googleusercontent.com/avatar",
			Aud:           expectedAudience,
			Iss:           "https://accounts.google.com",
		}, nil
	}
	return nil, errors.New("invalid token: unrecognized test token")
}

func TestUserAuthAndDataEndpoints(t *testing.T) {
	ts := setupTestServer()
	defer ts.Close()

	userStore.SetTokenVerifier(&mockTokenVerifier{})

	// 1. Invalid Google Login (empty body)
	badRes, err := http.Post(ts.URL+"/api/auth/google", "application/json", strings.NewReader(`{}`))
	if err != nil {
		t.Fatalf("POST /api/auth/google error: %v", err)
	}
	if badRes.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty idToken, got %v", badRes.StatusCode)
	}

	// 1b. Reject invalid token
	invalidRes, err := http.Post(ts.URL+"/api/auth/google", "application/json", strings.NewReader(`{"idToken": "bad_token"}`))
	if err != nil || invalidRes.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for invalid token, got %v", invalidRes.StatusCode)
	}

	// 1c. Reject unverified email
	unverifiedRes, err := http.Post(ts.URL+"/api/auth/google", "application/json", strings.NewReader(`{"idToken": "unverified_email_token"}`))
	if err != nil || unverifiedRes.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unverified email, got %v", unverifiedRes.StatusCode)
	}
	var unvBody map[string]interface{}
	_ = json.NewDecoder(unverifiedRes.Body).Decode(&unvBody)
	if unvBody["error"] != "email_not_verified" {
		t.Fatalf("expected error email_not_verified, got %+v", unvBody)
	}

	// 1d. Reject expired token
	expiredRes, err := http.Post(ts.URL+"/api/auth/google", "application/json", strings.NewReader(`{"idToken": "expired_token"}`))
	if err != nil || expiredRes.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for expired token, got %v", expiredRes.StatusCode)
	}

	// 2. Successful Google Login (User 1 - Alice)
	loginBody := `{"idToken": "valid_token_alice"}`
	res1, err := http.Post(ts.URL+"/api/auth/google", "application/json", strings.NewReader(loginBody))
	if err != nil || res1.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/auth/google failed: status %v, err %v", res1.StatusCode, err)
	}
	var auth1 map[string]interface{}
	_ = json.NewDecoder(res1.Body).Decode(&auth1)
	token1, _ := auth1["token"].(string)
	if token1 == "" {
		t.Fatalf("expected session token for Alice")
	}

	// 3. /api/auth/me without token -> 401
	meBad, err := http.Get(ts.URL + "/api/auth/me")
	if err != nil || meBad.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for /api/auth/me without token, got %v", meBad.StatusCode)
	}

	// 4. /api/auth/me with Alice's token -> 200
	reqMe, _ := http.NewRequest("GET", ts.URL+"/api/auth/me", nil)
	reqMe.Header.Set("Authorization", "Bearer "+token1)
	respMe, err := http.DefaultClient.Do(reqMe)
	if err != nil || respMe.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for Alice /api/auth/me, got %v", respMe.StatusCode)
	}

	// 5. Alice Likes a Song
	likeBody := `{"videoId": "video_abc_123", "liked": true}`
	reqLike, _ := http.NewRequest("POST", ts.URL+"/api/user/likes", strings.NewReader(likeBody))
	reqLike.Header.Set("Authorization", "Bearer "+token1)
	reqLike.Header.Set("Content-Type", "application/json")
	respLike, err := http.DefaultClient.Do(reqLike)
	if err != nil || respLike.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/user/likes failed: status %v", respLike.StatusCode)
	}

	// 6. Alice Gets Likes
	reqGetLikes, _ := http.NewRequest("GET", ts.URL+"/api/user/likes", nil)
	reqGetLikes.Header.Set("Authorization", "Bearer "+token1)
	respGetLikes, err := http.DefaultClient.Do(reqGetLikes)
	if err != nil || respGetLikes.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/user/likes failed: status %v", respGetLikes.StatusCode)
	}
	var likesResp map[string]interface{}
	_ = json.NewDecoder(respGetLikes.Body).Decode(&likesResp)
	likesList, _ := likesResp["likes"].([]interface{})
	if len(likesList) != 1 || likesList[0] != "video_abc_123" {
		t.Fatalf("expected Alice to have 1 liked song 'video_abc_123', got %+v", likesResp)
	}

	// 7. Alice Records Play History
	histBody := `{"videoId": "video_abc_123", "title": "Song 1", "artist": "Artist 1"}`
	reqHist, _ := http.NewRequest("POST", ts.URL+"/api/user/history", strings.NewReader(histBody))
	reqHist.Header.Set("Authorization", "Bearer "+token1)
	reqHist.Header.Set("Content-Type", "application/json")
	respHist, err := http.DefaultClient.Do(reqHist)
	if err != nil || respHist.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/user/history failed: status %v", respHist.StatusCode)
	}

	// 8. User 2 (Bob) Logs in - Data Isolation Check
	loginBody2 := `{"idToken": "valid_token_bob"}`
	res2, err := http.Post(ts.URL+"/api/auth/google", "application/json", strings.NewReader(loginBody2))
	if err != nil || res2.StatusCode != http.StatusOK {
		t.Fatalf("Bob login failed: status %v", res2.StatusCode)
	}
	var auth2 map[string]interface{}
	_ = json.NewDecoder(res2.Body).Decode(&auth2)
	token2, _ := auth2["token"].(string)

	// Bob's likes MUST be empty (never see Alice's liked song!)
	reqBobLikes, _ := http.NewRequest("GET", ts.URL+"/api/user/likes", nil)
	reqBobLikes.Header.Set("Authorization", "Bearer "+token2)
	respBobLikes, err := http.DefaultClient.Do(reqBobLikes)
	if err != nil || respBobLikes.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/user/likes for Bob failed: status %v", respBobLikes.StatusCode)
	}
	var bobLikesResp map[string]interface{}
	_ = json.NewDecoder(respBobLikes.Body).Decode(&bobLikesResp)
	bobLikesList, _ := bobLikesResp["likes"].([]interface{})
	if len(bobLikesList) != 0 {
		t.Fatalf("Bob should have 0 liked songs (isolated from Alice), got %+v", bobLikesList)
	}

	// 9. Alice Creates Playlist
	plBody := `{"title": "My Chill Mix", "tracks": ["video_abc_123"]}`
	reqPl, _ := http.NewRequest("POST", ts.URL+"/api/user/playlists", strings.NewReader(plBody))
	reqPl.Header.Set("Authorization", "Bearer "+token1)
	reqPl.Header.Set("Content-Type", "application/json")
	respPl, err := http.DefaultClient.Do(reqPl)
	if err != nil || respPl.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/user/playlists failed: status %v", respPl.StatusCode)
	}

	// 10. Logout Alice
	reqLogout, _ := http.NewRequest("POST", ts.URL+"/api/auth/logout", nil)
	reqLogout.Header.Set("Authorization", "Bearer "+token1)
	respLogout, err := http.DefaultClient.Do(reqLogout)
	if err != nil || respLogout.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/auth/logout failed: status %v", respLogout.StatusCode)
	}

	// 11. Alice calls /api/auth/me after logout -> 401
	respMeAfterLogout, err := http.DefaultClient.Do(reqMe)
	if err != nil || respMeAfterLogout.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for /api/auth/me after logout, got %v", respMeAfterLogout.StatusCode)
	}
}
