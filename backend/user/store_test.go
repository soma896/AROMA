package user

import (
	"os"
	"path/filepath"
	"testing"
)

func TestUserStoreLifecycle(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "aroma-user-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	filePath := filepath.Join(tmpDir, "users.json")
	store := NewStore(filePath)

	// 1. Create a user via Google token info
	info := &GoogleTokenInfo{
		Sub:     "google-sub-12345",
		Email:   "alice@example.com",
		Name:    "Alice Wonder",
		Picture: "https://example.com/alice.jpg",
	}

	u, sess, err := store.UpsertGoogleUser(info)
	if err != nil {
		t.Fatalf("unexpected error upserting user: %v", err)
	}
	if u.Email != "alice@example.com" {
		t.Errorf("expected email alice@example.com, got %s", u.Email)
	}
	if sess.Token == "" {
		t.Fatal("expected non-empty session token")
	}

	// 2. Validate session
	fetchedUser, err := store.GetUserByToken(sess.Token)
	if err != nil {
		t.Fatalf("unexpected error fetching user by token: %v", err)
	}
	if fetchedUser.ID != u.ID {
		t.Errorf("expected user ID %s, got %s", u.ID, fetchedUser.ID)
	}

	// 3. User A data: Likes, History, Playlists
	store.SetLike(u.ID, "vid-1", true)
	store.SetLike(u.ID, "vid-2", true)
	likes := store.GetLikes(u.ID)
	if len(likes) != 2 || likes[0] != "vid-2" || likes[1] != "vid-1" {
		t.Errorf("unexpected likes order: %v", likes)
	}

	store.RecordHistory(u.ID, HistoryItem{VideoID: "vid-1", Title: "Song 1", Artist: "Artist 1"})
	history := store.GetHistory(u.ID)
	if len(history) != 1 || history[0].VideoID != "vid-1" {
		t.Errorf("unexpected history: %+v", history)
	}

	pl := store.UpsertPlaylist(u.ID, &UserPlaylist{Title: "Chill Vibes", Tracks: []string{"vid-1"}})
	if pl.ID == "" {
		t.Error("expected playlist ID to be generated")
	}

	// 4. Create User B and verify complete data isolation
	infoB := &GoogleTokenInfo{
		Sub:     "google-sub-67890",
		Email:   "bob@example.com",
		Name:    "Bob Builder",
		Picture: "https://example.com/bob.jpg",
	}
	uB, _, err := store.UpsertGoogleUser(infoB)
	if err != nil {
		t.Fatalf("error creating user B: %v", err)
	}

	// User B must have completely empty data
	if len(store.GetLikes(uB.ID)) != 0 {
		t.Errorf("user B should have 0 likes, got %v", store.GetLikes(uB.ID))
	}
	if len(store.GetHistory(uB.ID)) != 0 {
		t.Errorf("user B should have 0 history items, got %v", store.GetHistory(uB.ID))
	}
	if len(store.GetPlaylists(uB.ID)) != 0 {
		t.Errorf("user B should have 0 playlists, got %v", store.GetPlaylists(uB.ID))
	}

	// 5. Test Persistence: Reload store from disk
	storeReloaded := NewStore(filePath)
	uReloaded, err := storeReloaded.GetUserByToken(sess.Token)
	if err != nil {
		t.Fatalf("expected valid session after reload, got: %v", err)
	}
	if uReloaded.Email != "alice@example.com" {
		t.Errorf("expected alice@example.com, got %s", uReloaded.Email)
	}
	if len(storeReloaded.GetLikes(u.ID)) != 2 {
		t.Errorf("expected 2 likes after reload, got %d", len(storeReloaded.GetLikes(u.ID)))
	}

	// 6. Test Logout / Session Invalidation
	store.InvalidateSession(sess.Token)
	if _, err := store.GetUserByToken(sess.Token); err == nil {
		t.Error("expected error after invalidating session")
	}
}
