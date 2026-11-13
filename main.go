package main

import (
	"embed"
	"fmt"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()
	err := wails.Run(&options.App{
		Title:            "LightPDF",
		Width:            1360,
		Height:           860,
		MinWidth:         940,
		MinHeight:        600,
		Frameless:        true,
		AssetServer:      &assetserver.Options{Assets: assets},
		BackgroundColour: options.NewRGB(246, 247, 249),
		Windows: &windows.Options{
			// 关闭 GPU 硬件加速可显著降低 WebView2 GPU 进程的内存占用。
			WebviewGpuIsDisabled: true,
			// 禁用 WebView2 自带的 Ctrl+滚轮/捏合页面缩放，由应用自行处理 PDF 缩放。
			IsZoomControlEnabled: false,
			DisablePinchZoom:     true,
		},
		OnStartup:     app.startup,
		OnBeforeClose: app.beforeClose,
		Bind:          []interface{}{app},
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,
			DisableWebViewDrop: true,
		},
		// 单实例锁：文件关联双击/右键打开时，参数会转发给已运行的实例。
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId:               "lightpdf-single-instance-8f2c1a52-7c2e-4f88-9a51-03d5e6b7f4a1",
			OnSecondInstanceLaunch: app.onSecondInstanceLaunch,
		},
	})
	if err != nil {
		fmt.Println("LightPDF 启动失败:", err)
	}
}
