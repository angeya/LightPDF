package backend

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const maxRecent = 10

func normalizePath(p string) string {
	return strings.ToLower(filepath.Clean(p))
}

// ConfigDir 返回应用配置目录（Windows 下为 %AppData%/LightPDF）。
func ConfigDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(base, "LightPDF")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

func atomicWrite(path string, data []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func loadJSON(path string, target interface{}) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	_ = json.Unmarshal(data, target)
}

// RecentStore 最近打开记录存储（JSON，原子写入）。
type RecentStore struct {
	mu   sync.Mutex
	path string
	list []RecentFile
}

// NewRecentStore 创建并加载最近打开记录。
func NewRecentStore(dir string) *RecentStore {
	s := &RecentStore{path: filepath.Join(dir, "recent.json"), list: []RecentFile{}}
	loadJSON(s.path, &s.list)
	if len(s.list) > maxRecent {
		s.list = s.list[:maxRecent]
	}
	return s
}

func (s *RecentStore) saveLocked() {
	data, err := json.MarshalIndent(s.list, "", "  ")
	if err != nil {
		return
	}
	_ = atomicWrite(s.path, data)
}

func (s *RecentStore) snapshotLocked() []RecentFile {
	out := make([]RecentFile, len(s.list))
	copy(out, s.list)
	return out
}

// List 返回按最近打开时间排序的记录（最多 10 条）。
func (s *RecentStore) List() []RecentFile {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.snapshotLocked()
}

// Find 返回指定路径的记录（不存在返回 nil）。
func (s *RecentStore) Find(path string) *RecentFile {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, r := range s.list {
		if normalizePath(r.FilePath) == normalizePath(path) {
			copy := r
			return &copy
		}
	}
	return nil
}

// Upsert 新增或更新记录，并将其移动到最前。
func (s *RecentStore) Upsert(rec RecentFile) []RecentFile {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := normalizePath(rec.FilePath)
	for _, r := range s.list {
		if normalizePath(r.FilePath) == key {
			if rec.LastPage <= 0 {
				rec.LastPage = r.LastPage
			}
			if rec.Zoom <= 0 {
				rec.Zoom = r.Zoom
			}
			break
		}
	}
	if rec.Zoom <= 0 {
		rec.Zoom = 1
	}
	if rec.LastOpenedAt == 0 {
		rec.LastOpenedAt = time.Now().UnixMilli()
	}

	out := make([]RecentFile, 0, maxRecent)
	out = append(out, rec)
	for _, r := range s.list {
		if normalizePath(r.FilePath) == key {
			continue
		}
		if len(out) >= maxRecent {
			break
		}
		out = append(out, r)
	}
	s.list = out
	s.saveLocked()
	return s.snapshotLocked()
}

// Remove 移除指定路径的记录。
func (s *RecentStore) Remove(path string) []RecentFile {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := normalizePath(path)
	out := make([]RecentFile, 0, len(s.list))
	for _, r := range s.list {
		if normalizePath(r.FilePath) != key {
			out = append(out, r)
		}
	}
	s.list = out
	s.saveLocked()
	return s.snapshotLocked()
}

// UpdateProgress 保存上次阅读页码与缩放比例（不改变记录顺序）。
func (s *RecentStore) UpdateProgress(path string, page int, zoom float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := normalizePath(path)
	changed := false
	for i := range s.list {
		if normalizePath(s.list[i].FilePath) == key {
			s.list[i].LastPage = page
			if zoom > 0 {
				s.list[i].Zoom = zoom
			}
			changed = true
			break
		}
	}
	if changed {
		s.saveLocked()
	}
}

// SettingsStore 阅读设置存储。
type SettingsStore struct {
	mu       sync.Mutex
	path     string
	settings ReaderSettings
}

// NewSettingsStore 创建并加载阅读设置。
func NewSettingsStore(dir string) *SettingsStore {
	s := &SettingsStore{path: filepath.Join(dir, "settings.json"), settings: DefaultSettings()}
	loadJSON(s.path, &s.settings)
	s.ensureDefaultsLocked()
	return s
}

func (s *SettingsStore) ensureDefaultsLocked() {
	if s.settings.UITheme == "" {
		s.settings.UITheme = "system"
	}
	if s.settings.PDFTheme == "" {
		s.settings.PDFTheme = "original"
	}
	if s.settings.SidebarWidth < 180 || s.settings.SidebarWidth > 520 {
		s.settings.SidebarWidth = 260
	}
	if s.settings.DefaultZoom <= 0 {
		s.settings.DefaultZoom = 1
	}
}

// Get 返回当前设置副本。
func (s *SettingsStore) Get() ReaderSettings {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.settings
}

// Save 持久化设置。
func (s *SettingsStore) Save(v ReaderSettings) ReaderSettings {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settings = v
	s.ensureDefaultsLocked()
	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err == nil {
		_ = atomicWrite(s.path, data)
	}
	return s.settings
}
