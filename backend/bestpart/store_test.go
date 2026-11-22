package bestpart

import (
	"testing"
)

func TestStoreGetSet(t *testing.T) {
	s := NewStore()

	// 1. Missing item
	if _, ok := s.Get("song123"); ok {
		t.Fatalf("expected song123 to not exist")
	}

	// 2. Set item
	m := &Metadata{
		SongId:     "song123",
		StartSec:   45.2,
		EndSec:     75.5,
		Verified:   true,
		Method:     "ai",
		Confidence: 0.95,
		Title:      "Test Song",
		Artist:     "Test Artist",
	}
	s.Set(m)

	got, ok := s.Get("song123")
	if !ok {
		t.Fatalf("expected song123 to exist")
	}
	if got.StartSec != 45.2 || got.EndSec != 75.5 || !got.Verified || got.Method != "ai" {
		t.Fatalf("mismatch in stored metadata: %+v", got)
	}
	if got.UpdatedAt == 0 {
		t.Fatalf("expected non-zero UpdatedAt")
	}

	// 3. List
	all := s.List()
	if len(all) != 1 {
		t.Fatalf("expected 1 item in list, got %d", len(all))
	}
	if s.Len() != 1 {
		t.Fatalf("expected Len() == 1, got %d", s.Len())
	}
}
