#!/bin/bash
# Scaffold Domain - 產生 Clean Architecture Domain Layer 模板

ENTITY_NAME="$1"

if [ -z "$ENTITY_NAME" ]; then
    echo "🏗️  ZenBill Domain Layer Scaffold"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Usage: $0 <EntityName>"
    echo ""
    echo "Examples:"
    echo "  $0 Payment"
    echo "  $0 Subscription"
    echo "  $0 Budget"
    echo ""
    echo "This will generate:"
    echo "  - internal/domain/<entity>.go"
    echo "  - internal/repository/<entity>_repository.go"
    exit 1
fi

# 轉換成小寫作為檔案名稱
ENTITY_LOWER=$(echo "$ENTITY_NAME" | tr '[:upper:]' '[:lower:]')
DOMAIN_DIR="internal/domain"
REPO_DIR="internal/repository"

# 取得專案的 Go module 名稱
GO_MODULE=$(go list -m 2>/dev/null || echo "github.com/your-username/zenbill")

echo "🏗️  Scaffolding Domain Layer for: $ENTITY_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 確保目錄存在
mkdir -p "$DOMAIN_DIR" "$REPO_DIR"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. 建立 Domain Entity
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ENTITY_FILE="$DOMAIN_DIR/${ENTITY_LOWER}.go"

if [ -f "$ENTITY_FILE" ]; then
    echo "⚠️  File already exists: $ENTITY_FILE"
    echo "   Skipping entity creation..."
else
    cat > "$ENTITY_FILE" << EOF
package domain

import "time"

// ${ENTITY_NAME} represents a ${ENTITY_LOWER} entity in the system
type ${ENTITY_NAME} struct {
	ID        int64     \`json:"id"\`
	CreatedAt time.Time \`json:"created_at"\`
	UpdatedAt time.Time \`json:"updated_at"\`

	// TODO: Add your fields here based on Schema
	// Use schema-inspector to check database design:
	//   .claude/skills/schema-inspector/scripts/inspect.sh ${ENTITY_LOWER}s
}

// TableName specifies the table name for GORM
func (${ENTITY_NAME}) TableName() string {
	return "${ENTITY_LOWER}s"
}

// ${ENTITY_NAME}Repository defines the interface for ${ENTITY_LOWER} data access
type ${ENTITY_NAME}Repository interface {
	Create(${ENTITY_LOWER} *${ENTITY_NAME}) error
	GetByID(id int64) (*${ENTITY_NAME}, error)
	Update(${ENTITY_LOWER} *${ENTITY_NAME}) error
	Delete(id int64) error
	List(limit, offset int) ([]*${ENTITY_NAME}, error)

	// TODO: Add custom query methods here
	// Example:
	// GetByUserID(userID int64) ([]*${ENTITY_NAME}, error)
	// GetByDateRange(start, end time.Time) ([]*${ENTITY_NAME}, error)
}
EOF
    echo "✅ Created: $ENTITY_FILE"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. 建立 Repository Implementation
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REPO_FILE="$REPO_DIR/${ENTITY_LOWER}_repository.go"

if [ -f "$REPO_FILE" ]; then
    echo "⚠️  File already exists: $REPO_FILE"
    echo "   Skipping repository creation..."
else
    cat > "$REPO_FILE" << EOF
package repository

import (
	"${GO_MODULE}/internal/domain"
	"gorm.io/gorm"
)

type ${ENTITY_LOWER}Repository struct {
	db *gorm.DB
}

// New${ENTITY_NAME}Repository creates a new ${ENTITY_LOWER} repository
func New${ENTITY_NAME}Repository(db *gorm.DB) domain.${ENTITY_NAME}Repository {
	return &${ENTITY_LOWER}Repository{db: db}
}

// Create inserts a new ${ENTITY_LOWER} into the database
func (r *${ENTITY_LOWER}Repository) Create(${ENTITY_LOWER} *domain.${ENTITY_NAME}) error {
	return r.db.Create(${ENTITY_LOWER}).Error
}

// GetByID retrieves a ${ENTITY_LOWER} by its ID
func (r *${ENTITY_LOWER}Repository) GetByID(id int64) (*domain.${ENTITY_NAME}, error) {
	var ${ENTITY_LOWER} domain.${ENTITY_NAME}
	err := r.db.First(&${ENTITY_LOWER}, id).Error
	if err != nil {
		return nil, err
	}
	return &${ENTITY_LOWER}, nil
}

// Update updates an existing ${ENTITY_LOWER}
func (r *${ENTITY_LOWER}Repository) Update(${ENTITY_LOWER} *domain.${ENTITY_NAME}) error {
	return r.db.Save(${ENTITY_LOWER}).Error
}

// Delete removes a ${ENTITY_LOWER} by its ID
func (r *${ENTITY_LOWER}Repository) Delete(id int64) error {
	return r.db.Delete(&domain.${ENTITY_NAME}{}, id).Error
}

// List retrieves a paginated list of ${ENTITY_LOWER}s
func (r *${ENTITY_LOWER}Repository) List(limit, offset int) ([]*domain.${ENTITY_NAME}, error) {
	var ${ENTITY_LOWER}s []*domain.${ENTITY_NAME}
	err := r.db.Limit(limit).Offset(offset).Find(&${ENTITY_LOWER}s).Error
	return ${ENTITY_LOWER}s, err
}

// TODO: Implement custom query methods here
// Example:
//
// func (r *${ENTITY_LOWER}Repository) GetByUserID(userID int64) ([]*domain.${ENTITY_NAME}, error) {
// 	var ${ENTITY_LOWER}s []*domain.${ENTITY_NAME}
// 	err := r.db.Where("user_id = ?", userID).Find(&${ENTITY_LOWER}s).Error
// 	return ${ENTITY_LOWER}s, err
// }
EOF
    echo "✅ Created: $REPO_FILE"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Scaffolding completed!"
echo ""
echo "📝 Next steps:"
echo ""
echo "1️⃣  Check Schema design:"
echo "   .claude/skills/schema-inspector/scripts/inspect.sh ${ENTITY_LOWER}s"
echo ""
echo "2️⃣  Add fields to Entity:"
echo "   vim $ENTITY_FILE"
echo ""
echo "3️⃣  Implement custom methods in Repository:"
echo "   vim $REPO_FILE"
echo ""
echo "4️⃣  Run Lint check:"
echo "   .claude/skills/lint-check/scripts/lint.sh"
echo ""
echo "5️⃣  Write tests:"
echo "   touch internal/repository/${ENTITY_LOWER}_repository_test.go"
echo ""
echo "6️⃣  Create Usecase (optional):"
echo "   touch internal/usecase/${ENTITY_LOWER}_usecase.go"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 Clean Architecture Rules:"
echo "   - Domain layer: No GORM imports, only interfaces"
echo "   - Repository layer: Implements domain interfaces with GORM"
echo "   - Follow ZenBill coding guidelines (see CLAUDE.md)"
