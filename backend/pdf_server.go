package backend

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// PdfServer 只监听回环地址的本地 PDF 文件服务。
// 通过随机端口 + 随机令牌 + 随机文档 ID 授权，URL 不能直接指定任意本地文件路径。
type PdfServer struct {
	mu       sync.RWMutex
	files    map[string]string
	token    string
	port     int
	server   *http.Server
	listener net.Listener
}

// NewPdfServer 创建 PDF 文件服务。
func NewPdfServer() *PdfServer {
	return &PdfServer{files: make(map[string]string)}
}

func randomHex(n int) string {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}
	return hex.EncodeToString(buf)
}

// Start 启动服务，绑定 127.0.0.1 的随机端口。
func (s *PdfServer) Start() error {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("无法启动本地 PDF 服务: %w", err)
	}
	s.listener = ln
	s.port = ln.Addr().(*net.TCPAddr).Port
	s.token = randomHex(24)

	mux := http.NewServeMux()
	mux.HandleFunc("/pdf/", s.handlePdf)
	s.server = &http.Server{
		Handler:           s.withCORS(mux),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	go func() {
		_ = s.server.Serve(ln)
	}()
	return nil
}

func (s *PdfServer) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Range, Content-Type, Authorization")
		h.Set("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range, Content-Type")
		h.Set("Access-Control-Max-Age", "600")
		if r.Header.Get("Access-Control-Request-Private-Network") == "true" {
			h.Set("Access-Control-Allow-Private-Network", "true")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *PdfServer) authorized(r *http.Request) bool {
	if s.token == "" {
		return false
	}
	if r.URL.Query().Get("token") == s.token {
		return true
	}
	return r.Header.Get("Authorization") == "Bearer "+s.token
}

func (s *PdfServer) handlePdf(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/pdf/")
	if id == "" || strings.ContainsAny(id, `/\.`) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.mu.RLock()
	path, ok := s.files[id]
	s.mu.RUnlock()
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	f, err := os.Open(path)
	if err != nil {
		http.Error(w, "文件不可读，可能已被移动、删除或占用", http.StatusForbidden)
		return
	}
	defer f.Close()
	stat, err := f.Stat()
	if err != nil || stat.IsDir() {
		http.Error(w, "文件不可读", http.StatusForbidden)
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "no-store")
	// ServeContent 原生支持 Range / Content-Range / HEAD，PDF.js 可按需分段读取大文件。
	http.ServeContent(w, r, filepath.Base(path), stat.ModTime(), f)
}

// Register 授权一个本地 PDF 文件并返回可供 PDF.js 加载的 URL。
func (s *PdfServer) Register(path string) (docID string, url string, err error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", "", err
	}
	docID = randomHex(16)
	s.mu.Lock()
	s.files[docID] = abs
	s.mu.Unlock()
	url = fmt.Sprintf("http://127.0.0.1:%d/pdf/%s?token=%s", s.port, docID, s.token)
	return docID, url, nil
}

// Path 返回已授权文档 ID 对应的文件路径。
func (s *PdfServer) Path(docID string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, ok := s.files[docID]
	return p, ok
}

// Unregister 撤销授权。
func (s *PdfServer) Unregister(docID string) {
	s.mu.Lock()
	delete(s.files, docID)
	s.mu.Unlock()
}

// Shutdown 应用退出时关闭服务。
func (s *PdfServer) Shutdown() {
	if s.server == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = s.server.Shutdown(ctx)
}
