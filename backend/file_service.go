package backend

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ValidatePdfFile 校验 PDF 文件是否存在、可读且扩展名合法。
func ValidatePdfFile(path string) (os.FileInfo, error) {
	if strings.TrimSpace(path) == "" {
		return nil, fmt.Errorf("文件路径为空")
	}
	if !strings.EqualFold(filepath.Ext(path), ".pdf") {
		return nil, fmt.Errorf("仅支持打开 PDF 文件")
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("文件不存在，可能已被移动或删除")
		}
		return nil, fmt.Errorf("无法访问文件: %w", err)
	}
	if info.IsDir() {
		return nil, fmt.Errorf("选择的内容不是 PDF 文件")
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("没有读取权限或文件被其他程序占用")
	}
	_ = f.Close()
	return info, nil
}

// FileExists 检查文件是否仍然存在。
func FileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// GetFileInfo 获取文件基础信息。
func GetFileInfo(path string) FileInfo {
	result := FileInfo{Path: path, Name: filepath.Base(path)}
	info, err := os.Stat(path)
	if err != nil {
		return result
	}
	result.Exists = true
	result.Size = info.Size()
	result.ModTime = info.ModTime().UnixMilli()
	return result
}

// OpenPdf 授权并登记一个 PDF 文件。
func (s *PdfServer) OpenPdf(recent *RecentStore, path string) (PdfHandle, error) {
	info, err := ValidatePdfFile(path)
	if err != nil {
		return PdfHandle{}, err
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return PdfHandle{}, err
	}
	docID, url, err := s.Register(abs)
	if err != nil {
		return PdfHandle{}, err
	}

	old := recent.Find(abs)
	rec := RecentFile{
		FilePath:     abs,
		FileName:     filepath.Base(abs),
		LastOpenedAt: time.Now().UnixMilli(),
	}
	if old != nil {
		rec.LastPage = old.LastPage
		rec.Zoom = old.Zoom
	}
	recent.Upsert(rec)

	return PdfHandle{
		DocID:     docID,
		URL:       url,
		FilePath:  abs,
		FileName:  filepath.Base(abs),
		Size:      info.Size(),
		LastPage:  rec.LastPage,
		Zoom:      rec.Zoom,
		UISupport: true,
	}, nil
}

// ReadPdfBase64 是 HTTP Range 方案不可用时的降级通道：一次性返回文件字节（base64）。
func (s *PdfServer) ReadPdfBase64(docID string) (string, error) {
	path, ok := s.Path(docID)
	if !ok {
		return "", fmt.Errorf("文档授权已失效，请重新打开")
	}
	if _, err := ValidatePdfFile(path); err != nil {
		return "", err
	}
	const maxFallbackSize = 200 << 20
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if info.Size() > maxFallbackSize {
		return "", fmt.Errorf("文件过大，无法使用降级方式加载")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %w", err)
	}
	return base64.StdEncoding.EncodeToString(data), nil
}
