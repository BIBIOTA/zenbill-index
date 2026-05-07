# Swagger API Documentation Design

**Date:** 2026-02-21
**Status:** Approved

## Goal

Add Swagger UI interactive documentation to ZenBill API using swaggo/swag + gin-swagger.

## Architecture

```
swag init (scan handler annotations)
        ↓
    docs/docs.go + swagger.json/yaml (auto-generated)
        ↓
    gin-swagger middleware serves /swagger/*
        ↓
    Browser: http://localhost:8080/swagger/index.html
```

## Dependencies

- `github.com/swaggo/swag` - annotation parser & doc generator
- `github.com/swaggo/gin-swagger` - Gin middleware
- `github.com/swaggo/files` - Swagger UI static assets

## Files to Modify

| File | Change |
|------|--------|
| `cmd/api/main.go` | Add global `@title`, `@version` annotations + swagger route |
| `internal/delivery/http/account_handler.go` | Add swag annotations per handler |
| `internal/delivery/http/invoice_handler.go` | Add swag annotations per handler |
| `internal/delivery/http/transaction_handler.go` | Add swag annotations per handler |
| `internal/delivery/http/category_handler.go` | Add swag annotations per handler |
| `internal/delivery/http/merchant_handler.go` | Add swag annotations per handler |
| `internal/delivery/http/bank_handler.go` | Add swag annotations per handler |
| `internal/delivery/http/exchange_rate_handler.go` | Add swag annotations per handler |
| `internal/delivery/http/response.go` | Add swagger model definitions for response wrappers |

## Auto-Generated Files (via `swag init`)

- `docs/docs.go`
- `docs/swagger.json`
- `docs/swagger.yaml`

## API Endpoints to Document

### Health Check
- `GET /health`

### Invoices (3 endpoints)
- `GET /api/v1/invoices` - List invoices (paginated, filterable)
- `POST /api/v1/invoices/sync` - Trigger manual sync
- `PATCH /api/v1/invoices/:id/status` - Update invoice status

### Auth (1 endpoint)
- `POST /api/v1/auth/login` - Login to e-invoice platform

### Accounts (5 endpoints)
- `GET /api/v1/accounts` - List accounts
- `POST /api/v1/accounts` - Create account
- `GET /api/v1/accounts/:id` - Get account
- `PUT /api/v1/accounts/:id` - Update account
- `DELETE /api/v1/accounts/:id` - Delete account

### Transactions (5 endpoints)
- `GET /api/v1/transactions` - List transactions (paginated, filterable)
- `POST /api/v1/transactions` - Create transaction
- `GET /api/v1/transactions/:id` - Get transaction
- `PUT /api/v1/transactions/:id` - Update transaction
- `DELETE /api/v1/transactions/:id` - Delete transaction

### Categories (4 endpoints)
- `GET /api/v1/categories` - List categories (tree)
- `POST /api/v1/categories` - Create category
- `PUT /api/v1/categories/:id` - Update category
- `DELETE /api/v1/categories/:id` - Delete category

### Merchants (4 endpoints)
- `GET /api/v1/merchants` - List merchants
- `POST /api/v1/merchants` - Create merchant
- `PUT /api/v1/merchants/:id` - Update merchant
- `DELETE /api/v1/merchants/:id` - Delete merchant

### Banks (1 endpoint)
- `GET /api/v1/banks` - List/search banks

### Exchange Rates (1 endpoint)
- `GET /api/v1/exchange-rates` - Get exchange rate

## Annotation Style

```go
// ListAccounts godoc
// @Summary      列出所有帳戶
// @Description  取得使用者的所有帳戶列表
// @Tags         accounts
// @Produce      json
// @Success      200  {object}  Response{data=[]domain.Account}
// @Failure      500  {object}  ErrorResponse
// @Router       /api/v1/accounts [get]
```

## Out of Scope

- No API authentication middleware changes
- No code generation from OpenAPI spec
- No business logic changes
