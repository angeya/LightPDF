package backend

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPdfServerRangeAndAuthorization(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sample.pdf")
	data := bytes.Repeat([]byte("0123456789"), 100)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}

	server := NewPdfServer()
	if err := server.Start(); err != nil {
		t.Fatal(err)
	}
	defer server.Shutdown()

	docID, url, err := server.Register(path)
	if err != nil {
		t.Fatal(err)
	}
	if docID == "" || !strings.Contains(url, "127.0.0.1") {
		t.Fatalf("invalid handle: %q %q", docID, url)
	}

	baseURL := strings.Split(url, "?")[0]
	resp, err := http.Get(baseURL)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 without token, got %d", resp.StatusCode)
	}

	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Range", "bytes=10-19")
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusPartialContent {
		t.Fatalf("expected 206, got %d", resp.StatusCode)
	}
	if got := resp.Header.Get("Content-Range"); got != "bytes 10-19/1000" {
		t.Fatalf("unexpected Content-Range: %q", got)
	}
	if string(body) != "0123456789" {
		t.Fatalf("unexpected range body: %q", body)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("missing CORS header: %q", got)
	}

	req, _ = http.NewRequest(http.MethodHead, url, nil)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if resp.Header.Get("Accept-Ranges") != "bytes" {
		t.Fatal("HEAD response should advertise byte ranges")
	}

	server.Unregister(docID)
	resp, err = http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 after unregister, got %d", resp.StatusCode)
	}
}

func TestValidatePdfFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "doc.pdf")
	if err := os.WriteFile(path, []byte("%PDF-1.4"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := ValidatePdfFile(path); err != nil {
		t.Fatalf("valid pdf rejected: %v", err)
	}
	if _, err := ValidatePdfFile(filepath.Join(dir, "missing.pdf")); err == nil {
		t.Fatal("missing file should be rejected")
	}
	txt := filepath.Join(dir, "note.txt")
	if err := os.WriteFile(txt, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := ValidatePdfFile(txt); err == nil {
		t.Fatal("non-pdf file should be rejected")
	}
}

func TestRecentStoreLimitAndPersistence(t *testing.T) {
	dir := t.TempDir()
	store := NewRecentStore(dir)
	for i := 0; i < 12; i++ {
		store.Upsert(RecentFile{
			FilePath:     filepath.Join(dir, fmt.Sprintf("f%d.pdf", i)),
			FileName:     fmt.Sprintf("f%d.pdf", i),
			LastOpenedAt: int64(i),
		})
	}
	list := store.List()
	if len(list) != maxRecent {
		t.Fatalf("expected %d records, got %d", maxRecent, len(list))
	}
	if !strings.HasSuffix(list[0].FilePath, "f11.pdf") {
		t.Fatalf("newest record should be first, got %s", list[0].FilePath)
	}

	// 再次打开同一个文件：移动到最前且不产生重复。
	store.Upsert(RecentFile{
		FilePath:     filepath.Join(dir, "f10.pdf"),
		FileName:     "f10.pdf",
		LastOpenedAt: 999,
	})
	list = store.List()
	if len(list) != maxRecent || !strings.HasSuffix(list[0].FilePath, "f10.pdf") {
		t.Fatal("re-opened file should move to front without duplicates")
	}
	seen := map[string]bool{}
	for _, record := range list {
		if seen[record.FilePath] {
			t.Fatalf("duplicate record: %s", record.FilePath)
		}
		seen[record.FilePath] = true
	}

	store.UpdateProgress(list[0].FilePath, 42, 1.5)
	reloaded := NewRecentStore(dir).List()
	if len(reloaded) != maxRecent || reloaded[0].LastPage != 42 || reloaded[0].Zoom != 1.5 {
		t.Fatal("reading progress was not persisted")
	}

	removed := store.Remove(list[0].FilePath)
	if len(removed) != maxRecent-1 {
		t.Fatal("remove should delete exactly one record")
	}
}

func TestSettingsStorePersistence(t *testing.T) {
	dir := t.TempDir()
	store := NewSettingsStore(dir)
	want := ReaderSettings{
		UITheme:         "dark",
		PDFTheme:        "dark-invert",
		SidebarWidth:    330,
		SidebarExpanded: false,
		DefaultZoom:     1.25,
	}
	store.Save(want)
	got := NewSettingsStore(dir).Get()
	if got != want {
		t.Fatalf("settings not persisted: %+v", got)
	}
}
