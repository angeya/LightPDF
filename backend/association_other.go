//go:build !windows

package backend

import "errors"

var errAssociationUnsupported = errors.New("文件关联注册仅在 Windows 上可用")

func RegisterPdfAssociation() error {
	return errAssociationUnsupported
}

func UnregisterPdfAssociation() error {
	return errAssociationUnsupported
}

func GetAssociationStatus() AssociationStatus {
	return AssociationStatus{Registered: false, ExePath: ""}
}
