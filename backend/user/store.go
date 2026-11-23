package user

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// User represents an authenticated Aroma user account.
type User struct {
	ID        string `json:"id"`
	GoogleID  string `json:"googleId"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	Picture   string `json:"picture"`
	CreatedAt int64  `json:"createdAt"`
	LastLogin int64  `json:"lastLogin"`
}

// Session represents an active login session.
type Session struct {
	Token     string `json:"token"`
	UserID    string `json:"userId"`
	CreatedAt int64  `json:"createdAt"`
	ExpiresAt int64  `json:"expiresAt"`
}

// HistoryItem represents a played track in the user's personal listening history.
type HistoryItem struct {
	VideoID     string `json:"videoId"`
	Title       string `json:"title"`
	Artist      string `json:"artist"`
	ArtworkUrl  string `json:"artworkUrl,omitempty"`
	DurationSec int    `json:"durationSec,omitempty"`
	PlayedAt    int64  `json:"playedAt"`
}

// UserPlaylist represents a custom playlist created by the user.
type UserPlaylist struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description,omitempty"`
	Tracks      []string `json:"tracks"`
	CreatedAt   int64    `json:"createdAt"`
	UpdatedAt   int64    `json:"updatedAt"`
}

// UserData holds all personal data isolated per user.
type UserData struct {
	Likes          []string                 `json:"likes"`
	RecentlyPlayed []HistoryItem            `json:"recentlyPlayed"`
	Playlists      map[string]*UserPlaylist `json:"playlists"`
	Preferences    map[string]any           `json:"preferences"`
}

// Store manages users, sessions, and per-user personal data with persistence.
type Store struct {
	mu          sync.RWMutex
	filePath    string
	users       map[string]*User      // key: User.ID
	byGoogleID  map[string]string     // key: GoogleID -> User.ID
	sessions    map[string]*Session   // key: Session.Token
	userData    map[string]*UserData  // key: User.ID
	httpClient  *http.Client
}

type fileSnapshot struct {
	Users    []*User                  `json:"users"`
	UserData map[string]*UserData     `json:"userData"`
	Sessions []*Session               `json:"sessions"`
}

const (
	SessionDuration = 30 * 24 * time.Hour
	MaxHistoryItems = 200
)

// NewStore initializes a new User Store.
func NewStore(filePath string) *Store {
	s := &Store{
		filePath:   filePath,
		users:      make(map[string]*User),
		byGoogleID: make(map[string]string),
		sessions:   make(map[string]*Session),
		userData:   make(map[string]*UserData),
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
	s.load()
	return s
}

func (s *Store) load() {
	if s.filePath == "" {
		return
	}
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return
	}
	var snap fileSnapshot
	if err := json.Unmarshal(data, &snap); err != nil {
		return
	}
	now := time.Now().UnixMilli()
	for _, u := range snap.Users {
		s.users[u.ID] = u
		s.byGoogleID[u.GoogleID] = u.ID
	}
	for uid, ud := range snap.UserData {
		s.userData[uid] = ud
	}
	for _, sess := range snap.Sessions {
		if sess.ExpiresAt > now {
			s.sessions[sess.Token] = sess
		}
	}
}

func (s *Store) saveLocked() {
	if s.filePath == "" {
		return
	}
	dir := filepath.Dir(s.filePath)
	_ = os.MkdirAll(dir, 0755)

	snap := fileSnapshot{
		Users:    make([]*User, 0, len(s.users)),
		UserData: s.userData,
		Sessions: make([]*Session, 0, len(s.sessions)),
	}
	for _, u := range s.users {
		snap.Users = append(snap.Users, u)
	}
	now := time.Now().UnixMilli()
	for _, sess := range s.sessions {
		if sess.ExpiresAt > now {
			snap.Sessions = append(snap.Sessions, sess)
		}
	}

	data, err := json.MarshalIndent(snap, "", "  ")
	if err == nil {
		_ = os.WriteFile(s.filePath, data, 0644)
	}
}

func generateID(prefix string) string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%s_%s", prefix, hex.EncodeToString(b))
}

// GoogleTokenInfo is the payload returned by Google's token verification endpoint.
type GoogleTokenInfo struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified string `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	Aud           string `json:"aud"`
}

// VerifyGoogleToken validates an ID token against Google's OAuth2 tokeninfo endpoint.
func (s *Store) VerifyGoogleToken(idToken string) (*GoogleTokenInfo, error) {
	if idToken == "" {
		return nil, errors.New("empty id token")
	}

	url := "https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken
	resp, err := s.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to reach google tokeninfo: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("invalid google token (status %d): %s", resp.StatusCode, string(body))
	}

	var info GoogleTokenInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("failed to decode google token response: %w", err)
	}
	if info.Sub == "" {
		return nil, errors.New("missing subject in google token")
	}
	return &info, nil
}

// UpsertGoogleUser creates or updates a user from verified Google token info.
func (s *Store) UpsertGoogleUser(info *GoogleTokenInfo) (*User, *Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UnixMilli()
	userID, exists := s.byGoogleID[info.Sub]

	var u *User
	if exists {
		u = s.users[userID]
		u.LastLogin = now
		if info.Name != "" {
			u.Name = info.Name
		}
		if info.Picture != "" {
			u.Picture = info.Picture
		}
		if info.Email != "" {
			u.Email = info.Email
		}
	} else {
		userID = generateID("usr")
		u = &User{
			ID:        userID,
			GoogleID:  info.Sub,
			Email:     info.Email,
			Name:      info.Name,
			Picture:   info.Picture,
			CreatedAt: now,
			LastLogin: now,
		}
		s.users[userID] = u
		s.byGoogleID[info.Sub] = userID
		s.userData[userID] = &UserData{
			Likes:          make([]string, 0),
			RecentlyPlayed: make([]HistoryItem, 0),
			Playlists:      make(map[string]*UserPlaylist),
			Preferences:    make(map[string]any),
		}
	}

	// Create session
	sessToken := generateID("ses")
	sess := &Session{
		Token:     sessToken,
		UserID:    userID,
		CreatedAt: now,
		ExpiresAt: now + SessionDuration.Milliseconds(),
	}
	s.sessions[sessToken] = sess
	s.saveLocked()

	return u, sess, nil
}

// GetUserByToken validates a session token and returns the corresponding User.
func (s *Store) GetUserByToken(token string) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	sess, ok := s.sessions[token]
	if !ok {
		return nil, errors.New("session not found")
	}
	if time.Now().UnixMilli() > sess.ExpiresAt {
		return nil, errors.New("session expired")
	}
	u, ok := s.users[sess.UserID]
	if !ok {
		return nil, errors.New("user not found")
	}
	return u, nil
}

// InvalidateSession removes an active session.
func (s *Store) InvalidateSession(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.sessions, token)
	s.saveLocked()
}

// --- Per-User Data Access ---

func (s *Store) ensureUserDataLocked(userID string) *UserData {
	ud, ok := s.userData[userID]
	if !ok {
		ud = &UserData{
			Likes:          make([]string, 0),
			RecentlyPlayed: make([]HistoryItem, 0),
			Playlists:      make(map[string]*UserPlaylist),
			Preferences:    make(map[string]any),
		}
		s.userData[userID] = ud
	}
	return ud
}

// GetLikes returns liked video IDs for a user.
func (s *Store) GetLikes(userID string) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ud := s.userData[userID]
	if ud == nil {
		return []string{}
	}
	res := make([]string, len(ud.Likes))
	copy(res, ud.Likes)
	return res
}

// SetLike adds or removes a liked song for a user.
func (s *Store) SetLike(userID string, videoID string, liked bool) []string {
	s.mu.Lock()
	defer s.mu.Unlock()

	ud := s.ensureUserDataLocked(userID)
	filtered := make([]string, 0, len(ud.Likes))
	for _, id := range ud.Likes {
		if id != videoID {
			filtered = append(filtered, id)
		}
	}
	if liked {
		// Newest liked song at top
		ud.Likes = append([]string{videoID}, filtered...)
	} else {
		ud.Likes = filtered
	}
	s.saveLocked()

	res := make([]string, len(ud.Likes))
	copy(res, ud.Likes)
	return res
}

// IsLiked checks if a video ID is liked by the user.
func (s *Store) IsLiked(userID string, videoID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ud := s.userData[userID]
	if ud == nil {
		return false
	}
	for _, id := range ud.Likes {
		if id == videoID {
			return true
		}
	}
	return false
}

// RecordHistory adds or bumps a track in the user's personal listening history.
func (s *Store) RecordHistory(userID string, item HistoryItem) []HistoryItem {
	s.mu.Lock()
	defer s.mu.Unlock()

	ud := s.ensureUserDataLocked(userID)
	if item.PlayedAt == 0 {
		item.PlayedAt = time.Now().UnixMilli()
	}

	filtered := make([]HistoryItem, 0, len(ud.RecentlyPlayed))
	for _, h := range ud.RecentlyPlayed {
		if h.VideoID != item.VideoID {
			filtered = append(filtered, h)
		}
	}
	// Prepend latest item
	ud.RecentlyPlayed = append([]HistoryItem{item}, filtered...)
	if len(ud.RecentlyPlayed) > MaxHistoryItems {
		ud.RecentlyPlayed = ud.RecentlyPlayed[:MaxHistoryItems]
	}
	s.saveLocked()

	res := make([]HistoryItem, len(ud.RecentlyPlayed))
	copy(res, ud.RecentlyPlayed)
	return res
}

// GetHistory returns the user's personal recently played tracks.
func (s *Store) GetHistory(userID string) []HistoryItem {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ud := s.userData[userID]
	if ud == nil {
		return []HistoryItem{}
	}
	res := make([]HistoryItem, len(ud.RecentlyPlayed))
	copy(res, ud.RecentlyPlayed)
	return res
}

// GetPlaylists returns all custom playlists for the user.
func (s *Store) GetPlaylists(userID string) []*UserPlaylist {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ud := s.userData[userID]
	if ud == nil {
		return []*UserPlaylist{}
	}
	res := make([]*UserPlaylist, 0, len(ud.Playlists))
	for _, pl := range ud.Playlists {
		res = append(res, pl)
	}
	return res
}

// UpsertPlaylist creates or updates a custom playlist for the user.
func (s *Store) UpsertPlaylist(userID string, pl *UserPlaylist) *UserPlaylist {
	s.mu.Lock()
	defer s.mu.Unlock()

	ud := s.ensureUserDataLocked(userID)
	now := time.Now().UnixMilli()

	if pl.ID == "" {
		pl.ID = generateID("pl")
		pl.CreatedAt = now
	}
	pl.UpdatedAt = now
	if pl.Tracks == nil {
		pl.Tracks = []string{}
	}

	ud.Playlists[pl.ID] = pl
	s.saveLocked()
	return pl
}

// DeletePlaylist removes a playlist for the user.
func (s *Store) DeletePlaylist(userID string, playlistID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	ud := s.userData[userID]
	if ud == nil {
		return false
	}
	if _, ok := ud.Playlists[playlistID]; ok {
		delete(ud.Playlists, playlistID)
		s.saveLocked()
		return true
	}
	return false
}
