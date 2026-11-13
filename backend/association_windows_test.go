//go:build windows

package backend

import "testing"

func TestPdfAssociationRegisterAndUnregister(t *testing.T) {
	// 已有用户配置时不执行写入/清理，避免破坏真实的关联状态。
	if GetAssociationStatus().Registered {
		t.Skip("当前环境已注册文件关联，跳过测试")
	}

	if err := RegisterPdfAssociation(); err != nil {
		t.Fatalf("注册失败: %v", err)
	}
	status := GetAssociationStatus()
	if !status.Registered {
		t.Fatal("注册后状态检测应为已注册")
	}
	if status.ExePath == "" {
		t.Fatal("状态中应包含当前程序路径")
	}

	if err := UnregisterPdfAssociation(); err != nil {
		t.Fatalf("取消注册失败: %v", err)
	}
	if GetAssociationStatus().Registered {
		t.Fatal("取消注册后状态检测应为未注册")
	}
}
