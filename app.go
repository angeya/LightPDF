package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"lightpdf/backend"

	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App 是暴露给前端的 Go 绑定，只负责桌面能力与本地持久化。
type App struct {
	ctx      context.Context
	server   *backend.PdfServer
	recent   *backend.RecentStore
	settings *backend.SettingsStore
	mu       sync.Mutex
	args     []string
}

// NewApp 创建应用实例。
func NewApp() *App {
	dir, err := backend.ConfigDir()
	if err != nil {
		// 极端情况下退回当前目录，保证应用仍可启动。
		dir = "."
	}
	a := &App{
		server:   backend.NewPdfServer(),
		recent:   backend.NewRecentStore(dir),
		settings: backend.NewSettingsStore(dir),
	}
	for _, arg := range os.Args[1:] {
		if strings.EqualFold(filepath.Ext(arg), ".pdf") {
			a.args = append(a.args, arg)
		}
	}
	return a
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if err := a.server.Start(); err != nil {
		runtime.LogErrorf(ctx, "%v", err)
	}
}

func (a *App) beforeClose(ctx context.Context) bool {
	a.server.Shutdown()
	return false
}

// OpenPdfDialog 打开系统文件选择窗口。
func (a *App) OpenPdfDialog() (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择 PDF 文件",
		Filters: []runtime.FileFilter{
			{DisplayName: "PDF 文件 (*.pdf)", Pattern: "*.pdf"},
		},
	})
}

// OpenPdf 校验并授权打开一个 PDF 文件，同时更新最近打开记录。
func (a *App) OpenPdf(path string) (backend.PdfHandle, error) {
	return a.server.OpenPdf(a.recent, path)
}

// GetPdfData 降级通道：当本地 HTTP Range 服务不可用时，一次性返回文件字节（base64）。
func (a *App) GetPdfData(docID string) (string, error) {
	return a.server.ReadPdfBase64(docID)
}

// ClosePdf 关闭文档授权，释放后端资源。
func (a *App) ClosePdf(docID string) {
	a.server.Unregister(docID)
}

// FileExists 检测文件是否存在。
func (a *App) FileExists(path string) bool {
	return backend.FileExists(path)
}

// GetFileInfo 获取文件信息。
func (a *App) GetFileInfo(path string) backend.FileInfo {
	return backend.GetFileInfo(path)
}

// StartupArgs 返回通过命令行/文件关联传入的 PDF 路径。
func (a *App) StartupArgs() []string {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := make([]string, len(a.args))
	copy(out, a.args)
	return out
}

// RecentList 返回最近打开记录（最多 10 条）。
func (a *App) RecentList() []backend.RecentFile {
	return a.recent.List()
}

// RecentRemove 移除一条最近打开记录。
func (a *App) RecentRemove(path string) []backend.RecentFile {
	return a.recent.Remove(path)
}

// RecentUpdateProgress 保存阅读页码与缩放比例。
func (a *App) RecentUpdateProgress(path string, page int, zoom float64) error {
	if page <= 0 {
		return fmt.Errorf("页码无效")
	}
	a.recent.UpdateProgress(path, page, zoom)
	return nil
}

// SettingsGet 获取阅读设置。
func (a *App) SettingsGet() backend.ReaderSettings {
	return a.settings.Get()
}

// SettingsSave 保存阅读设置。
func (a *App) SettingsSave(s backend.ReaderSettings) backend.ReaderSettings {
	return a.settings.Save(s)
}

// WindowMinimise 最小化窗口（自定义标题栏）。
func (a *App) WindowMinimise() {
	runtime.WindowMinimise(a.ctx)
	a.emitWindowMaximised()
}

// WindowToggleMaximise 在最大化与还原之间切换。
func (a *App) WindowToggleMaximise() {
	runtime.WindowToggleMaximise(a.ctx)
	a.emitWindowMaximised()
}

// IsWindowMaximised 返回窗口当前是否处于最大化状态。
func (a *App) IsWindowMaximised() bool {
	return runtime.WindowIsMaximised(a.ctx)
}

// emitWindowMaximised 等窗口状态落定后，把最新状态推送给前端（用于切换最大化/还原图标）。
func (a *App) emitWindowMaximised() {
	go func() {
		time.Sleep(120 * time.Millisecond)
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "lightpdf:window-maximised", runtime.WindowIsMaximised(a.ctx))
		}
	}()
}

// WindowClose 退出应用。
func (a *App) WindowClose() {
	runtime.Quit(a.ctx)
}

// RegisterPdfAssociation 将 LightPDF 注册为 PDF 文件的打开方式（写入当前用户注册表）。
func (a *App) RegisterPdfAssociation() error {
	return backend.RegisterPdfAssociation()
}

// UnregisterPdfAssociation 取消文件关联注册并清理注册表项。
func (a *App) UnregisterPdfAssociation() error {
	return backend.UnregisterPdfAssociation()
}

// GetAssociationStatus 获取当前关联注册状态。
func (a *App) GetAssociationStatus() backend.AssociationStatus {
	return backend.GetAssociationStatus()
}

// OpenDefaultAppsSettings 打开系统「默认应用」设置页。
func (a *App) OpenDefaultAppsSettings() error {
	// ShellExecute 可直接打开 ms-settings URI。
	runtime.BrowserOpenURL(a.ctx, "ms-settings:defaultapps")
	return nil
}

// onSecondInstanceLaunch 单实例模式下，把第二个实例（文件关联双击/右键打开）的 PDF 参数转发给前端。
func (a *App) onSecondInstanceLaunch(data options.SecondInstanceData) {
	var pdfs []string
	for _, arg := range data.Args {
		if strings.EqualFold(filepath.Ext(arg), ".pdf") {
			pdfs = append(pdfs, arg)
		}
	}
	if len(pdfs) > 0 {
		runtime.EventsEmit(a.ctx, "lightpdf:open-files", pdfs)
	}
}
