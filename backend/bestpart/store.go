package bestpart

import (
	"sync"
	"time"
)

// Metadata represents a song's verified or detected Best Part timestamps.
type Metadata struct {
	SongId     string  `json:"songId"`
	StartSec   float64 `json:"startSec"`
	EndSec     float64 `json:"endSec"`
	Verified   bool    `json:"verified"`
	Method     string  `json:"method"` // "ai", "heatmap", "lyrics", "energy", "manual", "fallback"
	Confidence float64 `json:"confidence,omitempty"`
	Title      string  `json:"title,omitempty"`
	Artist     string  `json:"artist,omitempty"`
	UpdatedAt  int64   `json:"updatedAt"`
}

// Store provides thread-safe in-memory caching and persistence for Best Part metadata.
type Store struct {
	mu    sync.RWMutex
	items map[string]*Metadata
}

// NewStore initializes a new Store instance.
func NewStore() *Store {
	return &Store{
		items: make(map[string]*Metadata),
	}
}

// Get retrieves a song's Best Part metadata.
func (s *Store) Get(songId string) (*Metadata, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	m, ok := s.items[songId]
	if !ok {
		return nil, false
	}
	cp := *m
	return &cp, true
}

// Set saves or updates a song's Best Part metadata.
func (s *Store) Set(m *Metadata) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if m.UpdatedAt == 0 {
		m.UpdatedAt = time.Now().Unix()
	}
	cp := *m
	s.items[m.SongId] = &cp
}

// List returns all stored Best Part metadata entries.
func (s *Store) List() []*Metadata {
	s.mu.RLock()
	defer s.mu.RUnlock()

	res := make([]*Metadata, 0, len(s.items))
	for _, m := range s.items {
		cp := *m
		res = append(res, &cp)
	}
	return res
}

// Len returns the count of stored entries.
func (s *Store) Len() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.items)
}
