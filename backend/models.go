package backend

// PdfHandle 是一次成功打开后的授权句柄，前端凭此加载 PDF。
type PdfHandle struct {
	DocID     string  `json:"docId"`
	URL       string  `json:"url"`
	FilePath  string  `json:"filePath"`
	FileName  string  `json:"fileName"`
	Size      int64   `json:"size"`
	LastPage  int     `json:"lastPage"`
	Zoom      float64 `json:"zoom"`
	UISupport bool    `json:"uiSupport"`
}

// RecentFile 最近打开记录。
type RecentFile struct {
	FilePath     string  `json:"filePath"`
	FileName     string  `json:"fileName"`
	LastOpenedAt int64   `json:"lastOpenedAt"`
	LastPage     int     `json:"lastPage"`
	Zoom         float64 `json:"zoom"`
}

// ReaderSettings 阅读设置（本地持久化）。
type ReaderSettings struct {
	UITheme         string  `json:"uiTheme"`
	PDFTheme        string  `json:"pdfTheme"`
	SidebarWidth    int     `json:"sidebarWidth"`
	SidebarExpanded bool    `json:"sidebarExpanded"`
	DefaultZoom     float64 `json:"defaultZoom"`
}

// DefaultSettings 返回默认阅读设置。
func DefaultSettings() ReaderSettings {
	return ReaderSettings{
		UITheme:         "system",
		PDFTheme:        "original",
		SidebarWidth:    260,
		SidebarExpanded: true,
		DefaultZoom:     1,
	}
}

// FileInfo 文件基础信息。
type FileInfo struct {
	Path    string `json:"path"`
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	Exists  bool   `json:"exists"`
	ModTime int64  `json:"modTime"`
}

// AssociationStatus PDF 文件关联注册状态。
type AssociationStatus struct {
	Registered bool   `json:"registered"`
	ExePath    string `json:"exePath"`
}
