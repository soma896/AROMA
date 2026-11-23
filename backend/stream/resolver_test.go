package stream

import (
	"strings"
	"testing"
)

func TestStreamResolver(t *testing.T) {
	r := NewResolver()
	res, err := r.Resolve("V5c4BnmPTpU") // Dimaak Kharaab
	if err != nil {
		if strings.Contains(err.Error(), "no such host") || strings.Contains(err.Error(), "network is unreachable") {
			t.Skipf("Skipping test due to offline/sandbox environment: %v", err)
		}
		t.Fatalf("Resolve error: %v", err)
	}
	t.Logf("Resolved successfully from source: %s, formats count: %d", res.Source, len(res.Formats))
	if res.BestAudio != nil {
		t.Logf("Best audio itag: %d, mime: %s, bitrate: %d, url length: %d", res.BestAudio.Itag, res.BestAudio.MimeType, res.BestAudio.Bitrate, len(res.BestAudio.URL))
	}
}
