package stream

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
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
		Formats         []innertubeAdaptiveFormat `json:"formats"`
		AdaptiveFormats []innertubeAdaptiveFormat `json:"adaptiveFormats"`
	} `json:"streamingData"`
}

// Resolve attempts to resolve streamable audio formats using mobile InnerTube clients.
func (r *Resolver) Resolve(videoID string) (*StreamResult, error) {
	if videoID == "" {
		return nil, errors.New("empty videoId")
	}

	var errorsList []string

	// 1. Try Android client context (IN)
	res, err := r.resolveAndroid(videoID, "IN")
	if err == nil && len(res.Formats) > 0 {
		res.Source = "android-in"
		return res, nil
	}
	if err != nil {
		errorsList = append(errorsList, fmt.Sprintf("android-in: %v", err))
	}

	// 2. Try Android client context (US)
	res, err = r.resolveAndroid(videoID, "US")
	if err == nil && len(res.Formats) > 0 {
		res.Source = "android-us"
		return res, nil
	}
	if err != nil {
		errorsList = append(errorsList, fmt.Sprintf("android-us: %v", err))
	}

	// 3. Try VisionOS client context
	res, err = r.resolveVisionOS(videoID)
	if err == nil && len(res.Formats) > 0 {
		res.Source = "visionos"
		return res, nil
	}
	if err != nil {
		errorsList = append(errorsList, fmt.Sprintf("visionos: %v", err))
	}

	return nil, fmt.Errorf("unable to resolve stream for %s: %s", videoID, strings.Join(errorsList, " | "))
}

func (r *Resolver) resolveAndroid(videoID string, gl string) (*StreamResult, error) {
	ua := "com.google.android.youtube/21.03.36(Linux; U; Android 16; en_US; SM-S908E Build/TP1A.220624.014) gzip"
	payload := map[string]any{
		"context": map[string]any{
			"client": map[string]any{
				"clientName":        "ANDROID",
				"clientVersion":     "21.03.36",
				"androidSdkVersion": 36,
				"osName":            "Android",
				"osVersion":         "13",
				"platform":          "MOBILE",
				"clientFormFactor":  "SMALL_FORM_FACTOR",
				"userAgent":         ua,
				"hl":                "en",
				"gl":                gl,
			},
			"user": map[string]any{
				"enableSafetyMode": false,
				"lockedSafetyMode": false,
			},
			"request": map[string]any{
				"useSsl":                  true,
				"internalExperimentFlags": []any{},
			},
		},
		"videoId":        videoID,
		"contentCheckOk": true,
		"racyCheckOk":    true,
	}
	return r.executePlayerCall(videoID, payload, ua, "3", "21.03.36")
}

func (r *Resolver) resolveVisionOS(videoID string) (*StreamResult, error) {
	ua := "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15"
	payload := map[string]any{
		"context": map[string]any{
			"client": map[string]any{
				"clientName":    "VISIONOS",
				"clientVersion": "1.02",
				"osName":        "visionOS",
				"osVersion":     "26.5.23O471",
				"platform":      "MOBILE",
				"deviceMake":    "Apple",
				"deviceModel":   "RealityDevice17,1",
				"userAgent":     ua,
				"hl":            "en",
				"gl":            "US",
			},
		},
		"videoId":        videoID,
		"contentCheckOk": true,
		"racyCheckOk":    true,
	}
	return r.executePlayerCall(videoID, payload, ua, "101", "1.02")
}

func (r *Resolver) resolveIOS(videoID string) (*StreamResult, error) {
	ua := "com.google.ios.youtube/19.34.2 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X; en_US)"
	payload := map[string]any{
		"context": map[string]any{
			"client": map[string]any{
				"clientName":    "IOS",
				"clientVersion": "19.34.2",
				"deviceMake":    "Apple",
				"deviceModel":   "iPhone16,2",
				"osName":        "iOS",
				"osVersion":     "17.5.1.21F90",
				"platform":      "MOBILE",
				"userAgent":     ua,
				"hl":            "en",
				"gl":            "US",
			},
		},
		"videoId":        videoID,
		"contentCheckOk": true,
		"racyCheckOk":    true,
	}
	return r.executePlayerCall(videoID, payload, ua, "5", "19.34.2")
}

func (r *Resolver) executePlayerCall(videoID string, payload map[string]any, userAgent string, clientNameHeader string, clientVersion string) (*StreamResult, error) {
	reqBody, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false&alt=json", bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", userAgent)
	if clientNameHeader != "" {
		req.Header.Set("X-Youtube-Client-Name", clientNameHeader)
	}
	if clientVersion != "" {
		req.Header.Set("X-Youtube-Client-Version", clientVersion)
	}
	req.Header.Set("X-GOOG-API-FORMAT-VERSION", "2")

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
		for _, f := range parsed.StreamingData.Formats {
			if f.URL != "" && (strings.HasPrefix(f.MimeType, "audio/") || strings.Contains(f.MimeType, "mp4a") || f.AudioChannels > 0) {
				fmtItem := AudioFormat{
					Itag:          f.Itag,
					MimeType:      f.MimeType,
					Bitrate:       f.Bitrate,
					SampleRate:    f.AudioSampleRate,
					AudioChannels: f.AudioChannels,
					URL:           f.URL,
					ContentLength: f.ContentLength,
				}
				formats = append(formats, fmtItem)
				if bestAudio == nil || fmtItem.Bitrate > bestAudio.Bitrate {
					bestCopy := fmtItem
					bestAudio = &bestCopy
				}
			}
		}
	}

	if len(formats) == 0 {
		return nil, errors.New("no audio formats with direct URLs found")
	}

	durSec, _ := strconv.Atoi(parsed.VideoDetails.LengthSeconds)
	if durSec == 0 && bestAudio != nil {
		for _, f := range parsed.StreamingData.Formats {
			if f.ApproxDurationMs != "" {
				if ms, err := strconv.ParseInt(f.ApproxDurationMs, 10, 64); err == nil && ms > 0 {
					durSec = int(ms / 1000)
					break
				}
			}
		}
	}

	return &StreamResult{
		VideoID:     videoID,
		Title:       parsed.VideoDetails.Title,
		Author:      parsed.VideoDetails.Author,
		DurationSec: durSec,
		Formats:     formats,
		BestAudio:   bestAudio,
	}, nil
}

