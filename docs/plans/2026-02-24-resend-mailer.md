# Resend Mailer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 將 ZenBill 的 Magic Link 登入信從 SMTP 改為透過 Resend API 發送。

**Architecture:** 新增 `ResendMailer` struct 實作現有的 `MailSender` interface，不改動 `AuthService` 或 Auth 流程。只需替換 `cmd/api/main.go` 中的依賴注入。

**Tech Stack:** `github.com/resend/resend-go/v2`, 現有 `pkg/mailer` package。

---

### Task 1: 安裝 Resend Go SDK

**Files:**
- Modify: `backend/go.mod`, `backend/go.sum`

**Step 1: 安裝套件**

```bash
cd backend
go get github.com/resend/resend-go/v2
```

**Step 2: 確認安裝成功**

```bash
grep "resend" go.mod
```
Expected: 出現 `github.com/resend/resend-go/v2 v2.x.x`

**Step 3: Commit**

```bash
git add go.mod go.sum
git commit -m "chore: add resend-go SDK dependency"
```

---

### Task 2: 新增 ResendMailer

**Files:**
- Create: `backend/pkg/mailer/resend_mailer.go`
- Create: `backend/pkg/mailer/resend_mailer_test.go`

**Step 1: 寫 failing test**

建立 `backend/pkg/mailer/resend_mailer_test.go`：

```go
package mailer

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewResendMailer(t *testing.T) {
	m := NewResendMailer(ResendConfig{
		APIKey:      "re_test_key",
		FromAddress: "ZenBill <noreply@mail.bibiota.com>",
	})
	assert.NotNil(t, m)
	assert.Equal(t, "ZenBill <noreply@mail.bibiota.com>", m.fromAddress)
}
```

**Step 2: 執行確認 FAIL**

```bash
cd backend
go test ./pkg/mailer/... -run TestNewResendMailer -v
```
Expected: FAIL — `NewResendMailer undefined`

**Step 3: 實作 `resend_mailer.go`**

建立 `backend/pkg/mailer/resend_mailer.go`：

```go
package mailer

import (
	"github.com/resend/resend-go/v2"
)

type ResendConfig struct {
	APIKey      string
	FromAddress string
}

type ResendMailer struct {
	client      *resend.Client
	fromAddress string
}

func NewResendMailer(cfg ResendConfig) *ResendMailer {
	return &ResendMailer{
		client:      resend.NewClient(cfg.APIKey),
		fromAddress: cfg.FromAddress,
	}
}

func (m *ResendMailer) Send(to, subject, body string) error {
	params := &resend.SendEmailRequest{
		From:    m.fromAddress,
		To:      []string{to},
		Subject: subject,
		Html:    body,
	}
	_, err := m.client.Emails.Send(params)
	return err
}
```

**Step 4: 執行確認 PASS**

```bash
go test ./pkg/mailer/... -run TestNewResendMailer -v
```
Expected: PASS

**Step 5: Commit**

```bash
git add pkg/mailer/resend_mailer.go pkg/mailer/resend_mailer_test.go
git commit -m "feat(mailer): add ResendMailer implementing MailSender interface"
```

---

### Task 3: 更新 cmd/api/main.go 依賴注入

**Files:**
- Modify: `backend/cmd/api/main.go`（第 103-109 行）

**Step 1: 替換 mailSender 初始化**

找到這段（約第 103 行）：

```go
mailSender := mailer.New(mailer.Config{
    Host:     cfg.SMTP.Host,
    Port:     cfg.SMTP.Port,
    Username: cfg.SMTP.Username,
    Password: cfg.SMTP.Password,
    From:     cfg.SMTP.From,
})
```

換成：

```go
mailSender := mailer.NewResendMailer(mailer.ResendConfig{
    APIKey:      cfg.Resend.APIKey,
    FromAddress: cfg.Resend.FromAddress,
})
```

**Step 2: 確認編譯成功**

```bash
cd backend
go build ./cmd/api/...
```
Expected: 無錯誤

**Step 3: Commit**

```bash
git add cmd/api/main.go
git commit -m "feat(api): switch mailer from SMTP to Resend"
```

---

### Task 4: 填入 API Key 並手動驗證

**Files:**
- Modify: `backend/configs/config.yaml`

**Step 1: 填入 Resend API Key**

編輯 `configs/config.yaml`：

```yaml
resend:
  api_key: "re_你的真實APIKey"
  from_address: "ZenBill <noreply@mail.bibiota.com>"
```

**Step 2: 啟動 server 測試**

```bash
go run cmd/api/main.go
```

**Step 3: 發送測試請求**

```bash
curl -X POST http://localhost:8090/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "你的email@gmail.com"}'
```

Expected response：
```json
{"message": "登入連結已寄出，請查看信箱"}
```

Expected：收到來自 `noreply@mail.bibiota.com` 的登入信，點擊連結可正常登入。
