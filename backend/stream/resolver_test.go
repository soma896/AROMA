package stream

import (
	"testing"
)

func TestStreamResolver(t *testing.T) {
	r := NewResolver()
	res, err := r.Resolve("V5c4BnmPTpU") // Dimaak Kharaab
	if err != nil {
		t.Fatalf("Resolve error: %v", err)
	}
	t.Logf("Resolved successfully from source: %s, formats count: %d", res.Source, len(res.Formats))
	if res.BestAudio != nil {
		t.Logf("Best audio itag: %d, mime: %s, bitrate: %d, url length: %d", res.BestAudio.Itag, res.BestAudio.MimeType, res.BestAudio.Bitrate, len(res.BestAudio.URL))
	}
}
