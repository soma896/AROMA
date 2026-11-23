package stream

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// AudioFormat represents an available playable audio stream format.
type AudioFormat struct {
	Itag        int    `json:"itag"`
	MimeType    string `json:"mimeType"`
	Bitrate     int    `json:"bitrate"`
	SampleRate  string `json:"sampleRate,omitempty"`
	AudioChannels int  `json:"audioChannels,omitempty"`
	URL         string `json:"url"`
	ContentLength string `json:"contentLength,omitempty"`
}

// StreamResult is the resolved audio streaming data for a track.
type StreamResult struct {
	VideoID    string        `json:"videoId"`
	Title      string        `json:"title,omitempty"`
	Author     string        `json:"author,omitempty"`
	DurationSec int          `json:"durationSec,omitempty"`
	Formats    []AudioFormat `json:"formats"`
	BestAudio  *AudioFormat  `json:"bestAudio,omitempty"`
	Source     string        `json:"source"` // "android", "ios", "fallback"
}

// Resolver resolves audio streams for YouTube video IDs without web bot verification challenges.
type Resolver struct {
	httpClient *http.Client
}

// NewResolver creates a new audio stream resolver.
func NewResolver() *Resolver {
	return &Resolver{
		httpClient: &http.Client{Timeout: 12 * time.Second},
	}
}

type innertubeAdaptiveFormat struct {
	Itag          int    `json:"itag"`
	URL           string `json:"url"`
	MimeType      string `json:"mimeType"`
	Bitrate       int    `json:"bitrate"`
	AverageBitrate int   `json:"averageBitrate"`
	AudioQuality  string `json:"audioQuality"`
	ApproxDurationMs string `json:"approxDurationMs"`
	AudioSampleRate string `json:"audioSampleRate"`
	AudioChannels int    `json:"audioChannels"`
	ContentLength string `json:"contentLength"`
}

type innertubePlayerResponse struct {
	PlayabilityStatus struct {
		Status string `json:"status"`
		Reason string `json:"reason"`
	} `json:"playabilityStatus"`
	VideoDetails struct {
		Title         string `json:"title"`
		Author        string `json:"author"`
		LengthSeconds string `json:"lengthSeconds"`
	} `json:"videoDetails"`
	StreamingData struct {
		AdaptiveFormats []innertubeAdaptiveFormat `json:"adaptiveFormats"`
	} `json:"streamingData"`
}

// Resolve attempts to resolve streamable audio formats using mobile InnerTube clients.
func (r *Resolver) Resolve(videoID string) (*StreamResult, error) {
	if videoID == "" {
		return nil, errors.New("empty videoId")
	}

	// 1. Try Android client context
	res, err := r.resolveWithClient(videoID, "ANDROID", "19.34.42", "com.google.android.youtube/19.34.42 (Linux; U; Android 13) gzip")
	if err == nil && len(res.Formats) > 0 {
		res.Source = "android"
		return res, nil
	}

	// 2. Try iOS client context
	res, err = r.resolveWithClient(videoID, "IOS", "19.34.2", "com.google.ios.youtube/19.34.2 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X; en_US)")
	if err == nil && len(res.Formats) > 0 {
		res.Source = "ios"
		return res, nil
	}

	// 3. Try Invidious / Piped fallback instances
	res, err = r.resolveFallback(videoID)
	if err == nil && len(res.Formats) > 0 {
		res.Source = "fallback"
		return res, nil
	}

	return nil, fmt.Errorf("unable to resolve stream for %s: %w", videoID, err)
}

func (r *Resolver) resolveWithClient(videoID, clientName, clientVersion, userAgent string) (*StreamResult, error) {
	payload := map[string]any{
		"context": map[string]any{
			"client": map[string]any{
				"clientName":        clientName,
				"clientVersion":     clientVersion,
				"androidSdkVersion": 33,
				"osName":            "Android",
				"osVersion":         "13",
				"platform":          "MOBILE",
				"userAgent":         userAgent,
				"hl":                "en",
				"gl":                "US",
			},
		},
		"videoId":          videoID,
		"contentCheckOk":   true,
		"racyCheckOk":      true,
	}

	reqBody, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", "https://www.youtube.com/youtubei/v1/player?prettyPrint=false", bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Origin", "https://www.youtube.com")

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("player status %d: %s", resp.StatusCode, string(body))
	}

	var parsed innertubePlayerResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}

	if parsed.PlayabilityStatus.Status != "OK" && parsed.PlayabilityStatus.Status != "" {
		return nil, fmt.Errorf("playability status: %s (reason: %s)", parsed.PlayabilityStatus.Status, parsed.PlayabilityStatus.Reason)
	}

	formats := make([]AudioFormat, 0)
	var bestAudio *AudioFormat

	for _, af := range parsed.StreamingData.AdaptiveFormats {
		if strings.HasPrefix(af.MimeType, "audio/") && af.URL != "" {
			fmtItem := AudioFormat{
				Itag:          af.Itag,
				MimeType:      af.MimeType,
				Bitrate:       af.Bitrate,
				SampleRate:    af.AudioSampleRate,
				AudioChannels: af.AudioChannels,
				URL:           af.URL,
				ContentLength: af.ContentLength,
			}
			formats = append(formats, fmtItem)
			if bestAudio == nil || fmtItem.Bitrate > bestAudio.Bitrate {
				bestCopy := fmtItem
				bestAudio = &bestCopy
			}
		}
	}

	if len(formats) == 0 {
		return nil, errors.New("no audio formats with direct URLs found")
	}

	return &StreamResult{
		VideoID:   videoID,
		Title:     parsed.VideoDetails.Title,
		Author:    parsed.VideoDetails.Author,
		Formats:   formats,
		BestAudio: bestAudio,
	}, nil
}

func (r *Resolver) resolveFallback(videoID string) (*StreamResult, error) {
	// Try public invidious stream endpoints
	instances := []string{
		"https://inv.tux.pizza/api/v1/videos/",
		"https://invidious.nerdvpn.de/api/v1/videos/",
	}

	for _, inst := range instances {
		url := inst + videoID
		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "Aroma/2.0")
		resp, err := r.httpClient.Do(req)
		if err != nil {
			continue
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			continue
		}

		var payload struct {
			Title           string `json:"title"`
			Author          string `json:"author"`
			LengthSeconds   int    `json:"lengthSeconds"`
			AdaptiveFormats []struct {
				Itag     string `json:"itag"`
				URL      string `json:"url"`
				Type     string `json:"type"`
				Bitrate  string `json:"bitrate"`
				Encoding string `json:"encoding"`
			} `json:"adaptiveFormats"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			continue
		}

		formats := make([]AudioFormat, 0)
		var bestAudio *AudioFormat
		for _, af := range payload.AdaptiveFormats {
			if strings.HasPrefix(af.Type, "audio/") && af.URL != "" {
				fmtItem := AudioFormat{
					MimeType: af.Type,
					URL:      af.URL,
				}
				formats = append(formats, fmtItem)
				if bestAudio == nil {
					bestCopy := fmtItem
					bestAudio = &bestCopy
				}
			}
		}

		if len(formats) > 0 {
			return &StreamResult{
				VideoID:     videoID,
				Title:       payload.Title,
				Author:      payload.Author,
				DurationSec: payload.LengthSeconds,
				Formats:     formats,
				BestAudio:   bestAudio,
			}, nil
		}
	}

	return nil, errors.New("fallback instances unreachable")
}
