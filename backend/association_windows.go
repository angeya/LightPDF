//go:build windows

package backend

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"golang.org/x/sys/windows/registry"
)

// ProgID 与注册路径全部写入 HKCU（当前用户），无需管理员权限；
// 只把 LightPDF 加入 .pdf 的"打开方式"候选，不修改已有默认关联。
const (
	assocProgID  = "LightPDF.Document"
	assocAppName = "LightPDF"
	assocAppDesc = "轻量 PDF 阅读器"
	classesRoot  = `Software\Classes`
)

func currentExePath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("无法获取程序路径: %w", err)
	}
	return exe, nil
}

func setKeyValues(root registry.Key, path string, values map[string]string) error {
	key, _, err := registry.CreateKey(root, path, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("无法创建注册表项 %s: %w", path, err)
	}
	defer key.Close()
	for name, value := range values {
		if err := key.SetStringValue(name, value); err != nil {
			return fmt.Errorf("无法写入注册表值 %s\\%s: %w", path, name, err)
		}
	}
	return nil
}

func deleteKeyRecursive(root registry.Key, path string) error {
	key, err := registry.OpenKey(root, path, registry.READ)
	if err != nil {
		if errors.Is(err, registry.ErrNotExist) {
			return nil
		}
		return err
	}
	names, err := key.ReadSubKeyNames(-1)
	key.Close()
	if err != nil {
		return err
	}
	for _, name := range names {
		if err := deleteKeyRecursive(root, path+`\`+name); err != nil {
			return err
		}
	}
	if err := registry.DeleteKey(root, path); err != nil {
		if errors.Is(err, registry.ErrNotExist) {
			return nil
		}
		return err
	}
	return nil
}

func deleteValue(root registry.Key, path, name string) error {
	key, err := registry.OpenKey(root, path, registry.SET_VALUE)
	if err != nil {
		if errors.Is(err, registry.ErrNotExist) {
			return nil
		}
		return err
	}
	defer key.Close()
	if err := key.DeleteValue(name); err != nil {
		if errors.Is(err, registry.ErrNotExist) {
			return nil
		}
		return err
	}
	return nil
}

// RegisterPdfAssociation 写入文件关联注册表项：
// ProgID（显示名/图标/打开命令）、.pdf 打开方式候选、应用 Capabilities、RegisteredApplications。
func RegisterPdfAssociation() error {
	exe, err := currentExePath()
	if err != nil {
		return err
	}
	exe = strings.TrimSpace(exe)
	quotedExe := `"` + exe + `"`
	progKey := classesRoot + `\` + assocProgID

	// ProgID：显示名称
	if err := setKeyValues(registry.CURRENT_USER, progKey, map[string]string{
		"":                 assocAppDesc + " 文档",
		"FriendlyTypeName": assocAppDesc + " 文档",
	}); err != nil {
		return err
	}
	// DefaultIcon：资源管理器里的图标（取 exe 内嵌图标）
	if err := setKeyValues(registry.CURRENT_USER, progKey+`\DefaultIcon`, map[string]string{
		"": quotedExe + ",0",
	}); err != nil {
		return err
	}
	// 打开命令：右键打开/双击时以文件路径启动
	if err := setKeyValues(registry.CURRENT_USER, progKey+`\shell\open\command`, map[string]string{
		"": quotedExe + ` "%1"`,
	}); err != nil {
		return err
	}
	// 加入 .pdf 的"打开方式"候选，不改默认关联
	if err := setKeyValues(registry.CURRENT_USER, classesRoot+`\.pdf\OpenWithProgids`, map[string]string{
		assocProgID: "",
	}); err != nil {
		return err
	}
	// 系统设置中的"默认应用"识别信息
	if err := setKeyValues(registry.CURRENT_USER, `Software\`+assocAppName+`\Capabilities`, map[string]string{
		"ApplicationName":        assocAppName,
		"ApplicationDescription": assocAppDesc,
	}); err != nil {
		return err
	}
	if err := setKeyValues(registry.CURRENT_USER, `Software\`+assocAppName+`\Capabilities\FileAssociations`, map[string]string{
		".pdf": assocProgID,
	}); err != nil {
		return err
	}
	if err := setKeyValues(registry.CURRENT_USER, `Software\RegisteredApplications`, map[string]string{
		assocAppName: `Software\` + assocAppName + `\Capabilities`,
	}); err != nil {
		return err
	}
	return nil
}

// UnregisterPdfAssociation 清理 RegisterPdfAssociation 写入的全部注册表项。
func UnregisterPdfAssociation() error {
	if err := deleteKeyRecursive(registry.CURRENT_USER, classesRoot+`\`+assocProgID); err != nil {
		return fmt.Errorf("无法删除程序关联项: %w", err)
	}
	if err := deleteValue(registry.CURRENT_USER, classesRoot+`\.pdf\OpenWithProgids`, assocProgID); err != nil {
		return fmt.Errorf("无法更新打开方式候选列表: %w", err)
	}
	if err := deleteKeyRecursive(registry.CURRENT_USER, `Software\`+assocAppName); err != nil {
		return fmt.Errorf("无法删除应用能力信息: %w", err)
	}
	if err := deleteValue(registry.CURRENT_USER, `Software\RegisteredApplications`, assocAppName); err != nil {
		return fmt.Errorf("无法更新已注册应用列表: %w", err)
	}
	return nil
}

// GetAssociationStatus 检查当前程序是否已写入关联信息。
func GetAssociationStatus() AssociationStatus {
	exe, err := currentExePath()
	if err != nil {
		return AssociationStatus{Registered: false, ExePath: ""}
	}
	registered := false
	key, err := registry.OpenKey(
		registry.CURRENT_USER,
		classesRoot+`\`+assocProgID+`\shell\open\command`,
		registry.QUERY_VALUE,
	)
	if err == nil {
		value, _, _ := key.GetStringValue("")
		key.Close()
		lower := strings.ToLower(value)
		registered = strings.Contains(lower, strings.ToLower(exe)) && strings.Contains(lower, "%1")
	}
	return AssociationStatus{Registered: registered, ExePath: exe}
}
